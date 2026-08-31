from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from videoweave_api.core.config import Settings
from videoweave_api.db.models import Asset, AssetLineage, Job, Project, Shot, UploadSession
from videoweave_api.domain.enums import AssetStatus, JobType, MediaAssetType, UploadStatus
from videoweave_api.infrastructure.media.probe import MediaProbeError, probe_media
from videoweave_api.infrastructure.storage.s3 import S3Storage
from videoweave_api.schemas import ProjectCreate, UploadCompleteRequest, UploadCreate


class FoundationService:
    def __init__(self, db: Session, storage: S3Storage, settings: Settings) -> None:
        self.db = db
        self.storage = storage
        self.settings = settings

    def create_project(self, payload: ProjectCreate) -> Project:
        project = Project(name=payload.name.strip())
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def list_projects(self) -> list[Project]:
        return list(self.db.scalars(select(Project).order_by(Project.created_at.desc())))

    def get_project(self, project_id: str) -> Project:
        project = self.db.get(Project, project_id)
        if project is None:
            raise LookupError("project not found")
        return project

    def list_assets(self, project_id: str) -> list[Asset]:
        self.get_project(project_id)
        statement = select(Asset).where(Asset.project_id == project_id).order_by(Asset.created_at.desc())
        return list(self.db.scalars(statement))

    def get_asset(self, asset_id: str) -> Asset:
        asset = self.db.get(Asset, asset_id)
        if asset is None:
            raise LookupError("asset not found")
        return asset

    def asset_access_url(self, asset_id: str) -> str:
        asset = self.get_asset(asset_id)
        if asset.status != AssetStatus.READY.value:
            raise ValueError("asset is not ready")
        return self.storage.presign_get(asset.storage_key)

    def clear_analysis_outputs(self, asset_id: str) -> dict[str, int]:
        source = self.get_asset(asset_id)
        if source.type != MediaAssetType.VIDEO.value:
            raise ValueError("analysis cleanup requires a VIDEO asset")

        jobs = list(
            self.db.scalars(
                select(Job).where(
                    Job.input_asset_id == source.id,
                    Job.type == JobType.VIDEO_ANALYSIS.value,
                )
            )
        )
        if not jobs:
            return {"analysis_jobs": 0, "deleted_assets": 0, "deleted_shots": 0}

        job_ids = [job.id for job in jobs]
        derived_asset_ids = list(
            dict.fromkeys(
                self.db.scalars(
                    select(AssetLineage.derived_asset_id).where(
                        AssetLineage.source_asset_id == source.id,
                        AssetLineage.job_id.in_(job_ids),
                    )
                )
            )
        )
        derived_assets = (
            list(self.db.scalars(select(Asset).where(Asset.id.in_(derived_asset_ids))))
            if derived_asset_ids
            else []
        )
        shot_ids = list(
            self.db.scalars(
                select(Shot.id).where(
                    Shot.source_asset_id == source.id,
                    Shot.analysis_job_id.in_(job_ids),
                )
            )
        )

        self.storage.delete_objects([asset.storage_key for asset in derived_assets])

        self.db.execute(
            delete(Shot).where(
                Shot.source_asset_id == source.id,
                Shot.analysis_job_id.in_(job_ids),
            )
        )
        self.db.execute(
            delete(AssetLineage).where(
                AssetLineage.source_asset_id == source.id,
                AssetLineage.job_id.in_(job_ids),
            )
        )
        for asset in derived_assets:
            self.db.delete(asset)

        for job in jobs:
            previous = dict(job.result_json or {})
            job.result_json = {
                **previous,
                "outputs_cleared": True,
                "shot_count": 0,
                "shots": [],
                "representative_asset_ids": [],
                "analysis_asset_id": None,
            }

        self.db.commit()
        return {
            "analysis_jobs": len(jobs),
            "deleted_assets": len(derived_assets),
            "deleted_shots": len(shot_ids),
        }

    def initialize_upload(self, project_id: str, payload: UploadCreate) -> tuple[UploadSession, Asset]:
        self.get_project(project_id)
        asset = Asset(
            project_id=project_id,
            type=payload.asset_type.value,
            status=AssetStatus.UPLOADING.value,
            filename=payload.filename,
            mime_type=payload.mime_type,
            size=payload.size,
            storage_bucket=self.storage.bucket,
            storage_key="pending",
        )
        self.db.add(asset)
        self.db.flush()
        asset.storage_key = self.storage.build_asset_key(project_id, asset.id, payload.filename)
        provider_upload_id = self.storage.create_multipart_upload(asset.storage_key, payload.mime_type)
        upload = UploadSession(
            asset_id=asset.id,
            provider_upload_id=provider_upload_id,
            status=UploadStatus.ACTIVE.value,
            part_size=self.settings.multipart_part_size_bytes,
        )
        self.db.add(upload)
        self.db.commit()
        self.db.refresh(upload)
        self.db.refresh(asset)
        return upload, asset

    def _upload(self, upload_session_id: str) -> UploadSession:
        upload = self.db.get(UploadSession, upload_session_id)
        if upload is None:
            raise LookupError("upload session not found")
        return upload

    def presign_part(self, upload_session_id: str, part_number: int) -> str:
        if part_number < 1 or part_number > 10000:
            raise ValueError("part number must be between 1 and 10000")
        upload = self._upload(upload_session_id)
        if upload.status != UploadStatus.ACTIVE.value:
            raise ValueError("upload session is not active")
        return self.storage.presign_upload_part(
            upload.asset.storage_key, upload.provider_upload_id, part_number
        )

    def upload_status(self, upload_session_id: str) -> tuple[UploadSession, list[dict]]:
        upload = self._upload(upload_session_id)
        if upload.status != UploadStatus.ACTIVE.value:
            return upload, []
        return upload, self.storage.list_parts(upload.asset.storage_key, upload.provider_upload_id)

    def complete_upload(self, upload_session_id: str, payload: UploadCompleteRequest) -> Asset:
        upload = self._upload(upload_session_id)
        if upload.status != UploadStatus.ACTIVE.value:
            raise ValueError("upload session is not active")
        parts = [
            {"PartNumber": part.part_number, "ETag": part.etag}
            for part in sorted(payload.parts, key=lambda item: item.part_number)
        ]
        self.storage.complete_multipart_upload(
            upload.asset.storage_key, upload.provider_upload_id, parts
        )
        upload.status = UploadStatus.COMPLETED.value
        upload.completed_at = datetime.now(timezone.utc)
        asset = upload.asset
        asset.status = AssetStatus.PROCESSING.value
        self.db.commit()

        try:
            metadata = probe_media(self.storage.presign_get(asset.storage_key), self.settings)
            asset.metadata_json = metadata
            asset.width = metadata.get("width")
            asset.height = metadata.get("height")
            asset.duration = metadata.get("duration")
            asset.fps = metadata.get("fps")
            asset.frame_count = metadata.get("frame_count")
            asset.codec = metadata.get("video_codec")
            asset.audio_codec = metadata.get("audio_codec")
        except MediaProbeError as exc:
            asset.metadata_json = {"probe_error": str(exc)}

        asset.status = AssetStatus.READY.value
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def abort_upload(self, upload_session_id: str) -> None:
        upload = self._upload(upload_session_id)
        if upload.status != UploadStatus.ACTIVE.value:
            return
        self.storage.abort_multipart_upload(upload.asset.storage_key, upload.provider_upload_id)
        upload.status = UploadStatus.ABORTED.value
        upload.asset.status = AssetStatus.CANCELLED.value
        self.db.commit()