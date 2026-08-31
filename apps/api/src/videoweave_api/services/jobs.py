from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from videoweave_api.db.models import Asset, Job, Shot
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.schemas import KeyframeExtractionCreate, VideoAnalysisCreate


class JobService:
    def __init__(self, db: Session, queue: RedisJobQueue) -> None:
        self.db = db
        self.queue = queue

    def _ready_video(self, asset_id: str) -> Asset:
        asset = self.db.get(Asset, asset_id)
        if asset is None:
            raise LookupError("asset not found")
        if asset.type != MediaAssetType.VIDEO.value:
            raise ValueError("operation requires a VIDEO asset")
        if asset.status != AssetStatus.READY.value:
            raise ValueError("asset must be READY")
        if not asset.duration or asset.duration <= 0:
            raise ValueError("asset has no usable duration metadata")
        return asset

    def _enqueue(self, job: Job) -> Job:
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        try:
            self.queue.enqueue(job.id)
        except Exception as exc:
            job.state = JobState.FAILED.value
            job.stage = "queue"
            job.error = f"could not enqueue job: {exc}"
            job.finished_at = datetime.now(timezone.utc)
            self.db.commit()
            raise RuntimeError("could not enqueue job") from exc
        return job

    def create_keyframe_extraction(
        self,
        asset_id: str,
        payload: KeyframeExtractionCreate,
    ) -> Job:
        asset = self._ready_video(asset_id)
        return self._enqueue(
            Job(
                project_id=asset.project_id,
                type=JobType.KEYFRAME_EXTRACTION.value,
                state=JobState.QUEUED.value,
                progress=0.0,
                stage="queued",
                input_asset_id=asset.id,
                spec_json={"count": payload.count, "mode": "uniform"},
            )
        )

    def create_video_analysis(
        self,
        asset_id: str,
        payload: VideoAnalysisCreate,
    ) -> Job:
        asset = self._ready_video(asset_id)
        return self._enqueue(
            Job(
                project_id=asset.project_id,
                type=JobType.VIDEO_ANALYSIS.value,
                state=JobState.QUEUED.value,
                progress=0.0,
                stage="queued",
                input_asset_id=asset.id,
                spec_json={
                    "scene_threshold": payload.scene_threshold,
                    "detector": "ffmpeg-scdet",
                },
            )
        )

    def get_job(self, job_id: str) -> Job:
        job = self.db.get(Job, job_id)
        if job is None:
            raise LookupError("job not found")
        return job

    def list_jobs(self, project_id: str | None = None) -> list[Job]:
        statement = select(Job).order_by(Job.created_at.desc())
        if project_id:
            statement = statement.where(Job.project_id == project_id)
        return list(self.db.scalars(statement))

    def list_latest_shots(self, asset_id: str) -> list[Shot]:
        asset = self.db.get(Asset, asset_id)
        if asset is None:
            raise LookupError("asset not found")

        latest_job_id = self.db.scalar(
            select(Job.id)
            .where(
                Job.input_asset_id == asset_id,
                Job.type == JobType.VIDEO_ANALYSIS.value,
                Job.state == JobState.SUCCEEDED.value,
            )
            .order_by(Job.finished_at.desc(), Job.created_at.desc())
            .limit(1)
        )
        if latest_job_id is None:
            return []

        return list(
            self.db.scalars(
                select(Shot)
                .where(Shot.analysis_job_id == latest_job_id)
                .order_by(Shot.index.asc())
            )
        )
