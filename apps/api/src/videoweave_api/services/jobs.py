from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from videoweave_api.db.models import Asset, Job, Shot
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.schemas import (
    KeyframeExtractionCreate,
    SceneCandidateDetectionCreate,
    VideoAnalysisCreate,
)


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

    def create_scene_detection(
        self,
        asset_id: str,
        payload: SceneCandidateDetectionCreate,
    ) -> Job:
        asset = self._ready_video(asset_id)
        return self._enqueue(
            Job(
                project_id=asset.project_id,
                type=JobType.SCENE_DETECTION.value,
                state=JobState.QUEUED.value,
                progress=0.0,
                stage="queued",
                input_asset_id=asset.id,
                spec_json={
                    "floor_threshold": payload.floor_threshold,
                    "cluster_gap_frames": 3,
                    "detector": "ffmpeg-scdet",
                },
            )
        )

    def create_video_analysis(
        self,
        asset_id: str,
        payload: VideoAnalysisCreate,
    ) -> Job:
        asset = self._ready_video(asset_id)
        candidate_job_id = payload.candidate_job_id
        mode = "manual" if candidate_job_id is not None else payload.mode

        if mode == "manual" and payload.scene_threshold is None:
            raise ValueError("manual analysis requires scene_threshold")

        if candidate_job_id is not None:
            candidate_job = self.db.get(Job, candidate_job_id)
            if candidate_job is None:
                raise ValueError("candidate job not found")
            if candidate_job.type != JobType.SCENE_DETECTION.value:
                raise ValueError("candidate job is not scene detection")
            if candidate_job.input_asset_id != asset.id:
                raise ValueError("candidate job belongs to another asset")
            if candidate_job.state != JobState.SUCCEEDED.value:
                raise ValueError("candidate job must be SUCCEEDED")
            floor_threshold = float(candidate_job.result_json.get("floor_threshold", 1.0))
            if payload.scene_threshold is None or payload.scene_threshold < floor_threshold:
                raise ValueError("scene threshold is below candidate floor threshold")

        if mode == "auto":
            spec = {
                "mode": "auto",
                "detector": "pyscenedetect-adaptive",
                "adaptive_threshold": 3.0,
                "min_scene_len_frames": 3,
                "window_width": 2,
                "min_content_val": 15.0,
                "fallback_detector": "ffmpeg-scdet",
                "floor_threshold": 1.0,
                "cluster_gap_frames": 3,
                "mad_multiplier": 2.0,
            }
        else:
            spec = {
                "mode": "manual",
                "scene_threshold": payload.scene_threshold,
                "candidate_job_id": candidate_job_id,
                "cluster_gap_frames": 3,
                "detector": "ffmpeg-scdet",
            }

        return self._enqueue(
            Job(
                project_id=asset.project_id,
                type=JobType.VIDEO_ANALYSIS.value,
                state=JobState.QUEUED.value,
                progress=0.0,
                stage="queued",
                input_asset_id=asset.id,
                spec_json=spec,
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
