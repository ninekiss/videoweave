from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from videoweave_api.core.config import Settings
from videoweave_api.db.models import Asset, AssetLineage, Job
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.media.keyframes import extract_frame, uniform_timestamps
from videoweave_api.infrastructure.storage.s3 import S3Storage


class WorkerService:
    def __init__(
        self,
        db: Session,
        storage: S3Storage,
        settings: Settings,
        worker_id: str,
    ) -> None:
        self.db = db
        self.storage = storage
        self.settings = settings
        self.worker_id = worker_id

    def process(self, job_id: str) -> None:
        job = self.db.get(Job, job_id)
        if job is None or job.state != JobState.QUEUED.value:
            return

        job.state = JobState.RUNNING.value
        job.stage = "starting"
        job.progress = 0.01
        job.worker_id = self.worker_id
        job.started_at = datetime.now(timezone.utc)
        job.error = None
        self.db.commit()

        try:
            if job.type == JobType.KEYFRAME_EXTRACTION.value:
                self._extract_keyframes(job)
            else:
                raise ValueError(f"unsupported job type: {job.type}")
        except Exception as exc:
            self.db.rollback()
            failed_job = self.db.get(Job, job_id)
            if failed_job is not None:
                failed_job.state = JobState.FAILED.value
                failed_job.stage = "failed"
                failed_job.error = str(exc)[:8000]
                failed_job.finished_at = datetime.now(timezone.utc)
                self.db.commit()
            return

        job = self.db.get(Job, job_id)
        if job is not None:
            job.state = JobState.SUCCEEDED.value
            job.stage = "complete"
            job.progress = 1.0
            job.finished_at = datetime.now(timezone.utc)
            self.db.commit()

    def _extract_keyframes(self, job: Job) -> None:
        source = self.db.get(Asset, job.input_asset_id)
        if source is None:
            raise LookupError("source asset not found")
        if source.type != MediaAssetType.VIDEO.value:
            raise ValueError("source asset is not a video")
        if not source.duration or source.duration <= 0:
            raise ValueError("source video has no usable duration")

        count = int(job.spec_json.get("count", 8))
        timestamps = uniform_timestamps(source.duration, count)
        results: list[dict] = []

        with TemporaryDirectory(prefix="videoweave-keyframes-") as temp_dir:
            root = Path(temp_dir)
            suffix = Path(source.filename).suffix or ".video"
            source_path = root / f"source{suffix}"

            job.stage = "downloading"
            job.progress = 0.05
            self.db.commit()
            self.storage.download_file(source.storage_key, source_path)

            for index, timestamp in enumerate(timestamps, start=1):
                job.stage = f"extracting {index}/{count}"
                job.progress = 0.1 + 0.8 * ((index - 1) / count)
                self.db.commit()

                frame_path = root / f"keyframe-{index:03d}.jpg"
                extract_frame(source_path, frame_path, timestamp, self.settings)

                filename = f"{Path(source.filename).stem}-keyframe-{index:03d}.jpg"
                derived = Asset(
                    project_id=source.project_id,
                    type=MediaAssetType.IMAGE.value,
                    status=AssetStatus.PROCESSING.value,
                    filename=filename,
                    mime_type="image/jpeg",
                    size=frame_path.stat().st_size,
                    storage_bucket=self.storage.bucket,
                    storage_key="pending",
                    width=source.width,
                    height=source.height,
                    metadata_json={
                        "keyframe": {
                            "source_asset_id": source.id,
                            "timestamp": timestamp,
                            "index": index,
                            "count": count,
                            "mode": "uniform",
                        }
                    },
                )
                self.db.add(derived)
                self.db.flush()
                derived.storage_key = self.storage.build_asset_key(
                    source.project_id,
                    derived.id,
                    filename,
                )
                self.storage.upload_file(frame_path, derived.storage_key, "image/jpeg")
                derived.status = AssetStatus.READY.value

                lineage = AssetLineage(
                    source_asset_id=source.id,
                    derived_asset_id=derived.id,
                    job_id=job.id,
                    operator="extract-keyframe",
                    metadata_json={"timestamp": timestamp, "index": index, "mode": "uniform"},
                )
                self.db.add(lineage)

                results.append(
                    {
                        "asset_id": derived.id,
                        "timestamp": timestamp,
                        "index": index,
                    }
                )
                job.result_json = {
                    "asset_ids": [item["asset_id"] for item in results],
                    "keyframes": results,
                }
                job.progress = 0.1 + 0.8 * (index / count)
                self.db.commit()

        job.stage = "finalizing"
        job.progress = 0.95
        self.db.commit()
