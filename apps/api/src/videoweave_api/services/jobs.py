from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from videoweave_api.db.models import Asset, Job
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.schemas import KeyframeExtractionCreate


class JobService:
    def __init__(self, db: Session, queue: RedisJobQueue) -> None:
        self.db = db
        self.queue = queue

    def create_keyframe_extraction(
        self,
        asset_id: str,
        payload: KeyframeExtractionCreate,
    ) -> Job:
        asset = self.db.get(Asset, asset_id)
        if asset is None:
            raise LookupError("asset not found")
        if asset.type != MediaAssetType.VIDEO.value:
            raise ValueError("keyframe extraction requires a VIDEO asset")
        if asset.status != AssetStatus.READY.value:
            raise ValueError("asset must be READY before keyframe extraction")
        if not asset.duration or asset.duration <= 0:
            raise ValueError("asset has no usable duration metadata")

        job = Job(
            project_id=asset.project_id,
            type=JobType.KEYFRAME_EXTRACTION.value,
            state=JobState.QUEUED.value,
            progress=0.0,
            stage="queued",
            input_asset_id=asset.id,
            spec_json={"count": payload.count, "mode": "uniform"},
        )
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
