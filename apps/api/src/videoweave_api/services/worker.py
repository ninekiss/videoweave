from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from videoweave_api.core.config import Settings
from videoweave_api.db.models import Asset, AssetLineage, Job, Shot
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.media.keyframes import extract_frame, uniform_timestamps
from videoweave_api.infrastructure.media.scenes import build_shots, detect_scene_changes
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
            elif job.type == JobType.VIDEO_ANALYSIS.value:
                self._analyze_video(job)
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

    def _source_video(self, job: Job) -> Asset:
        source = self.db.get(Asset, job.input_asset_id)
        if source is None:
            raise LookupError("source asset not found")
        if source.type != MediaAssetType.VIDEO.value:
            raise ValueError("source asset is not a video")
        if not source.duration or source.duration <= 0:
            raise ValueError("source video has no usable duration")
        return source

    def _extract_keyframes(self, job: Job) -> None:
        source = self._source_video(job)
        count = int(job.spec_json.get("count", 8))
        timestamps = uniform_timestamps(source.duration, count)
        results: list[dict] = []

        with TemporaryDirectory(prefix="videoweave-keyframes-") as temp_dir:
            root = Path(temp_dir)
            source_path = self._download_source(source, root, job)

            for index, timestamp in enumerate(timestamps, start=1):
                job.stage = f"extracting {index}/{count}"
                job.progress = 0.1 + 0.8 * ((index - 1) / count)
                self.db.commit()

                frame_path = root / f"keyframe-{index:03d}.jpg"
                extract_frame(source_path, frame_path, timestamp, self.settings)

                filename = f"{Path(source.filename).stem}-keyframe-{index:03d}.jpg"
                derived = self._create_image_asset(
                    source,
                    frame_path,
                    filename,
                    {
                        "keyframe": {
                            "source_asset_id": source.id,
                            "timestamp": timestamp,
                            "index": index,
                            "count": count,
                            "mode": "uniform",
                        }
                    },
                )
                self.db.add(
                    AssetLineage(
                        source_asset_id=source.id,
                        derived_asset_id=derived.id,
                        job_id=job.id,
                        operator="extract-keyframe",
                        metadata_json={"timestamp": timestamp, "index": index, "mode": "uniform"},
                    )
                )

                results.append({"asset_id": derived.id, "timestamp": timestamp, "index": index})
                job.result_json = {
                    "asset_ids": [item["asset_id"] for item in results],
                    "keyframes": results,
                }
                job.progress = 0.1 + 0.8 * (index / count)
                self.db.commit()

        job.stage = "finalizing"
        job.progress = 0.95
        self.db.commit()

    def _analyze_video(self, job: Job) -> None:
        source = self._source_video(job)
        threshold = float(job.spec_json.get("scene_threshold", 10.0))

        with TemporaryDirectory(prefix="videoweave-analysis-") as temp_dir:
            root = Path(temp_dir)
            source_path = self._download_source(source, root, job)

            job.stage = "detecting scenes"
            job.progress = 0.12
            self.db.commit()
            changes = detect_scene_changes(source_path, threshold, self.settings)
            boundaries = build_shots(source.duration, changes)

            shot_results: list[dict] = []
            representative_asset_ids: list[str] = []
            total = len(boundaries)

            for boundary in boundaries:
                job.stage = f"representative frames {boundary.index}/{total}"
                job.progress = 0.2 + 0.65 * ((boundary.index - 1) / max(total, 1))
                self.db.commit()

                frame_path = root / f"shot-{boundary.index:03d}.jpg"
                extract_frame(
                    source_path,
                    frame_path,
                    boundary.representative_timestamp,
                    self.settings,
                )
                filename = f"{Path(source.filename).stem}-shot-{boundary.index:03d}.jpg"
                representative = self._create_image_asset(
                    source,
                    frame_path,
                    filename,
                    {
                        "shot_representative": {
                            "source_asset_id": source.id,
                            "analysis_job_id": job.id,
                            "shot_index": boundary.index,
                            "timestamp": boundary.representative_timestamp,
                            "start_time": boundary.start,
                            "end_time": boundary.end,
                        }
                    },
                )

                shot = Shot(
                    project_id=source.project_id,
                    source_asset_id=source.id,
                    analysis_job_id=job.id,
                    index=boundary.index,
                    start_time=boundary.start,
                    end_time=boundary.end,
                    duration=boundary.duration,
                    representative_asset_id=representative.id,
                    metadata_json={
                        "representative_timestamp": boundary.representative_timestamp,
                        "transition_score": boundary.transition_score,
                        "detector": "ffmpeg-scdet",
                    },
                )
                self.db.add(shot)
                self.db.flush()
                self.db.add(
                    AssetLineage(
                        source_asset_id=source.id,
                        derived_asset_id=representative.id,
                        job_id=job.id,
                        operator="shot-representative-frame",
                        metadata_json={
                            "shot_id": shot.id,
                            "shot_index": boundary.index,
                            "timestamp": boundary.representative_timestamp,
                        },
                    )
                )

                representative_asset_ids.append(representative.id)
                shot_results.append(
                    {
                        "id": shot.id,
                        "index": boundary.index,
                        "start_time": boundary.start,
                        "end_time": boundary.end,
                        "duration": boundary.duration,
                        "representative_timestamp": boundary.representative_timestamp,
                        "representative_asset_id": representative.id,
                        "transition_score": boundary.transition_score,
                    }
                )
                job.result_json = {
                    "shot_count": len(shot_results),
                    "shots": shot_results,
                    "representative_asset_ids": representative_asset_ids,
                }
                self.db.commit()

            analysis_data = {
                "kind": "video-structure",
                "source_asset_id": source.id,
                "job_id": job.id,
                "detector": "ffmpeg-scdet",
                "scene_threshold": threshold,
                "scene_changes": [
                    {"timestamp": change.timestamp, "score": change.score} for change in changes
                ],
                "shots": shot_results,
            }
            analysis_path = root / "video-analysis.json"
            analysis_path.write_text(
                json.dumps(analysis_data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            analysis_filename = f"{Path(source.filename).stem}-analysis-{job.id[:8]}.json"
            analysis_asset = Asset(
                project_id=source.project_id,
                type=MediaAssetType.ANALYSIS.value,
                status=AssetStatus.PROCESSING.value,
                filename=analysis_filename,
                mime_type="application/json",
                size=analysis_path.stat().st_size,
                storage_bucket=self.storage.bucket,
                storage_key="pending",
                metadata_json={
                    "analysis": {
                        "kind": "video-structure",
                        "source_asset_id": source.id,
                        "job_id": job.id,
                        "shot_count": len(shot_results),
                        "scene_threshold": threshold,
                        "detector": "ffmpeg-scdet",
                    }
                },
            )
            self.db.add(analysis_asset)
            self.db.flush()
            analysis_asset.storage_key = self.storage.build_asset_key(
                source.project_id,
                analysis_asset.id,
                analysis_filename,
            )
            self.storage.upload_file(analysis_path, analysis_asset.storage_key, "application/json")
            analysis_asset.status = AssetStatus.READY.value
            self.db.add(
                AssetLineage(
                    source_asset_id=source.id,
                    derived_asset_id=analysis_asset.id,
                    job_id=job.id,
                    operator="video-analysis",
                    metadata_json={
                        "detector": "ffmpeg-scdet",
                        "scene_threshold": threshold,
                        "shot_count": len(shot_results),
                    },
                )
            )

            job.result_json = {
                "analysis_asset_id": analysis_asset.id,
                "shot_count": len(shot_results),
                "shots": shot_results,
                "representative_asset_ids": representative_asset_ids,
                "scene_change_count": len(changes),
            }
            job.stage = "finalizing"
            job.progress = 0.95
            self.db.commit()

    def _download_source(self, source: Asset, root: Path, job: Job) -> Path:
        suffix = Path(source.filename).suffix or ".video"
        source_path = root / f"source{suffix}"
        job.stage = "downloading"
        job.progress = 0.05
        self.db.commit()
        self.storage.download_file(source.storage_key, source_path)
        return source_path

    def _create_image_asset(
        self,
        source: Asset,
        frame_path: Path,
        filename: str,
        metadata: dict,
    ) -> Asset:
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
            metadata_json=metadata,
        )
        self.db.add(derived)
        self.db.flush()
        derived.storage_key = self.storage.build_asset_key(source.project_id, derived.id, filename)
        self.storage.upload_file(frame_path, derived.storage_key, "image/jpeg")
        derived.status = AssetStatus.READY.value
        return derived
