from datetime import datetime, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from videoweave_api.core.config import Settings
from videoweave_api.db.models import Asset, AssetLineage, Job, Shot
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.media.keyframes import extract_frame, uniform_timestamps
from videoweave_api.infrastructure.media.scenes import (
    SceneChange,
    TransitionEvent,
    automatic_scene_threshold,
    build_shots,
    cluster_scene_changes,
    detect_scene_changes,
    event_changes,
)
from videoweave_api.infrastructure.media.shot_detection import (
    PYSCENEDETECT_ADAPTIVE,
    ShotDetectionError,
    detect_adaptive_shots,
)
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
            elif job.type == JobType.SCENE_DETECTION.value:
                self._detect_scene_candidates(job)
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

    @staticmethod
    def _event_payload(event: TransitionEvent) -> dict:
        return {
            "timestamp": event.timestamp,
            "score": event.score,
            "start": event.start,
            "end": event.end,
            "span": round(event.span, 6),
            "member_count": event.member_count,
        }

    def _detect_scene_candidates(self, job: Job) -> None:
        source = self._source_video(job)
        floor_threshold = float(job.spec_json.get("floor_threshold", 1.0))
        cluster_gap_frames = int(job.spec_json.get("cluster_gap_frames", 3))

        with TemporaryDirectory(prefix="videoweave-scenes-") as temp_dir:
            root = Path(temp_dir)
            source_path = self._download_source(source, root, job)
            job.stage = "detecting raw candidates"
            job.progress = 0.35
            self.db.commit()

            changes = detect_scene_changes(source_path, floor_threshold, self.settings)
            job.stage = "clustering transition events"
            job.progress = 0.75
            self.db.commit()
            events = cluster_scene_changes(
                changes,
                source.fps,
                max_gap_frames=cluster_gap_frames,
            )
            candidates = [
                {"timestamp": change.timestamp, "score": change.score}
                for change in changes
            ]
            job.result_json = {
                "detector": "ffmpeg-scdet",
                "duration": source.duration,
                "fps": source.fps,
                "floor_threshold": floor_threshold,
                "raw_candidate_count": len(candidates),
                "candidate_count": len(candidates),
                "candidates": candidates,
                "transition_event_count": len(events),
                "transition_events": [self._event_payload(event) for event in events],
                "clustering": {
                    "method": "fps-gap-peak",
                    "max_gap_frames": cluster_gap_frames,
                    "effective_fps": source.fps if source.fps and source.fps > 0 else 30.0,
                },
            }
            job.stage = "transition events ready"
            job.progress = 0.95
            self.db.commit()

    def _candidate_events(
        self,
        source: Asset,
        job: Job,
        threshold: float,
        cluster_gap_frames: int,
    ) -> tuple[list[SceneChange], list[TransitionEvent], int] | None:
        candidate_job_id = job.spec_json.get("candidate_job_id")
        if not candidate_job_id:
            return None

        candidate_job = self.db.get(Job, str(candidate_job_id))
        if candidate_job is None:
            raise ValueError("candidate job not found")
        if candidate_job.type != JobType.SCENE_DETECTION.value:
            raise ValueError("candidate job is not scene detection")
        if candidate_job.input_asset_id != source.id:
            raise ValueError("candidate job belongs to another asset")
        if candidate_job.state != JobState.SUCCEEDED.value:
            raise ValueError("candidate job must be SUCCEEDED")

        floor_threshold = float(candidate_job.result_json.get("floor_threshold", 1.0))
        if threshold < floor_threshold:
            raise ValueError("scene threshold is below candidate floor threshold")

        raw_candidates = candidate_job.result_json.get("candidates", [])
        if not isinstance(raw_candidates, list):
            raise ValueError("candidate job result is invalid")

        raw_changes: list[SceneChange] = []
        for item in raw_candidates:
            if not isinstance(item, dict):
                continue
            timestamp = item.get("timestamp")
            score = item.get("score")
            if not isinstance(timestamp, (int, float)) or not isinstance(score, (int, float)):
                continue
            raw_changes.append(SceneChange(timestamp=float(timestamp), score=float(score)))

        events = cluster_scene_changes(
            raw_changes,
            source.fps,
            max_gap_frames=cluster_gap_frames,
        )
        return event_changes(events, threshold), events, len(raw_changes)

    def _ffmpeg_auto_detection(
        self,
        source_path: Path,
        source: Asset,
        job: Job,
    ) -> tuple[list[SceneChange], float, dict]:
        floor_threshold = float(job.spec_json.get("floor_threshold", 1.0))
        cluster_gap_frames = int(job.spec_json.get("cluster_gap_frames", 3))
        mad_multiplier = float(job.spec_json.get("mad_multiplier", 2.0))

        job.stage = "detecting raw candidates · FFmpeg fallback"
        job.progress = 0.12
        self.db.commit()
        raw_changes = detect_scene_changes(source_path, floor_threshold, self.settings)

        job.stage = "clustering transition events · FFmpeg fallback"
        job.progress = 0.16
        self.db.commit()
        events = cluster_scene_changes(
            raw_changes,
            source.fps,
            max_gap_frames=cluster_gap_frames,
        )
        threshold, score_distribution = automatic_scene_threshold(
            events,
            floor_threshold=floor_threshold,
            mad_multiplier=mad_multiplier,
        )
        changes = event_changes(events, threshold)
        diagnostics = {
            "raw_candidate_count": len(raw_changes),
            "transition_event_count": len(events),
            "accepted_boundary_count": len(changes),
            "transition_events": [self._event_payload(event) for event in events],
            "score_distribution": score_distribution,
            "clustering": {
                "method": "fps-gap-peak",
                "max_gap_frames": cluster_gap_frames,
                "effective_fps": source.fps if source.fps and source.fps > 0 else 30.0,
            },
        }
        return changes, threshold, diagnostics

    def _analyze_video(self, job: Job) -> None:
        source = self._source_video(job)
        mode = str(job.spec_json.get("mode", "manual"))
        candidate_job_id = job.spec_json.get("candidate_job_id")
        requested_detector = str(job.spec_json.get("detector", "ffmpeg-scdet"))
        detector_used = requested_detector
        threshold: float | None = None
        diagnostics: dict = {}

        with TemporaryDirectory(prefix="videoweave-analysis-") as temp_dir:
            root = Path(temp_dir)
            source_path = self._download_source(source, root, job)

            if mode == "auto" and requested_detector == PYSCENEDETECT_ADAPTIVE:
                adaptive_threshold = float(job.spec_json.get("adaptive_threshold", 3.0))
                min_scene_len_frames = int(job.spec_json.get("min_scene_len_frames", 3))
                window_width = int(job.spec_json.get("window_width", 2))
                min_content_val = float(job.spec_json.get("min_content_val", 15.0))
                job.stage = "detecting shots · PySceneDetect"
                job.progress = 0.12
                self.db.commit()

                try:
                    detected = detect_adaptive_shots(
                        source_path,
                        adaptive_threshold=adaptive_threshold,
                        min_scene_len_frames=min_scene_len_frames,
                        window_width=window_width,
                        min_content_val=min_content_val,
                    )
                    changes = detected.changes
                    threshold = adaptive_threshold
                    detector_used = detected.detector
                    diagnostics = {
                        "detector_requested": requested_detector,
                        "detector_used": detector_used,
                        **detected.diagnostics,
                    }
                except ShotDetectionError as exc:
                    if job.spec_json.get("fallback_detector") != "ffmpeg-scdet":
                        raise
                    changes, threshold, fallback_diagnostics = self._ffmpeg_auto_detection(
                        source_path,
                        source,
                        job,
                    )
                    detector_used = "ffmpeg-scdet"
                    diagnostics = {
                        "detector_requested": requested_detector,
                        "detector_used": detector_used,
                        "fallback_reason": str(exc),
                        **fallback_diagnostics,
                    }
            elif mode == "auto" and requested_detector == "ffmpeg-scdet":
                changes, threshold, ffmpeg_diagnostics = self._ffmpeg_auto_detection(
                    source_path,
                    source,
                    job,
                )
                detector_used = "ffmpeg-scdet"
                diagnostics = {
                    "detector_requested": requested_detector,
                    "detector_used": detector_used,
                    **ffmpeg_diagnostics,
                }
            elif mode == "auto":
                raise ValueError(f"unsupported automatic shot detector: {requested_detector}")
            else:
                threshold = float(job.spec_json.get("scene_threshold", 10.0))
                cluster_gap_frames = int(job.spec_json.get("cluster_gap_frames", 3))
                reused = self._candidate_events(source, job, threshold, cluster_gap_frames)
                if reused is None:
                    job.stage = "detecting scenes · FFmpeg diagnostics"
                    job.progress = 0.12
                    self.db.commit()
                    raw_changes = detect_scene_changes(source_path, threshold, self.settings)
                    events = cluster_scene_changes(
                        raw_changes,
                        source.fps,
                        max_gap_frames=cluster_gap_frames,
                    )
                    changes = event_changes(events, threshold)
                    raw_count = len(raw_changes)
                else:
                    job.stage = "building calibrated shots"
                    job.progress = 0.16
                    self.db.commit()
                    changes, events, raw_count = reused

                detector_used = "ffmpeg-scdet"
                diagnostics = {
                    "detector_requested": requested_detector,
                    "detector_used": detector_used,
                    "raw_candidate_count": raw_count,
                    "transition_event_count": len(events),
                    "accepted_boundary_count": len(changes),
                    "transition_events": [self._event_payload(event) for event in events],
                    "score_distribution": {},
                    "clustering": {
                        "method": "fps-gap-peak",
                        "max_gap_frames": cluster_gap_frames,
                        "effective_fps": source.fps if source.fps and source.fps > 0 else 30.0,
                    },
                }

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
                        "detector": detector_used,
                        "analysis_mode": mode,
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
                    "mode": mode,
                    "detector": detector_used,
                    "scene_threshold": threshold,
                    "shot_count": len(shot_results),
                    "shots": shot_results,
                    "representative_asset_ids": representative_asset_ids,
                }
                self.db.commit()

            diagnostics.setdefault("accepted_boundary_count", len(changes))
            analysis_data = {
                "kind": "video-structure",
                "source_asset_id": source.id,
                "job_id": job.id,
                "detector": detector_used,
                "mode": mode,
                "scene_threshold": threshold,
                "candidate_job_id": candidate_job_id,
                **diagnostics,
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
                        "mode": mode,
                        "shot_count": len(shot_results),
                        "scene_threshold": threshold,
                        "candidate_job_id": candidate_job_id,
                        "accepted_boundary_count": len(changes),
                        "detector": detector_used,
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
                        "detector": detector_used,
                        "mode": mode,
                        "scene_threshold": threshold,
                        "candidate_job_id": candidate_job_id,
                        "shot_count": len(shot_results),
                    },
                )
            )

            job.result_json = {
                "analysis_asset_id": analysis_asset.id,
                "mode": mode,
                "detector": detector_used,
                "scene_threshold": threshold,
                "shot_count": len(shot_results),
                "shots": shot_results,
                "representative_asset_ids": representative_asset_ids,
                "scene_change_count": len(changes),
                "candidate_job_id": candidate_job_id,
                **diagnostics,
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
