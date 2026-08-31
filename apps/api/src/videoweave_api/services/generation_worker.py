from datetime import datetime, timezone
import mimetypes
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from videoweave_api.core.config import Settings
from videoweave_api.db.models import Asset, AssetLineage, Job
from videoweave_api.domain.enums import AssetStatus, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.execution.comfyui import ComfyUIAdapter
from videoweave_api.infrastructure.media.probe import MediaProbeError, probe_media
from videoweave_api.infrastructure.storage.s3 import S3Storage


class GenerationWorkerService:
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
        if job is None or job.type != JobType.GENERATION.value:
            return
        if job.state != JobState.QUEUED.value:
            return

        job.state = JobState.RUNNING.value
        job.stage = "starting generation"
        job.progress = 0.01
        job.worker_id = self.worker_id
        job.started_at = datetime.now(timezone.utc)
        job.error = None
        self.db.commit()

        try:
            self._generate(job)
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

        completed = self.db.get(Job, job_id)
        if completed is not None:
            completed.state = JobState.SUCCEEDED.value
            completed.stage = "complete"
            completed.progress = 1.0
            completed.finished_at = datetime.now(timezone.utc)
            self.db.commit()

    def _stage(self, job: Job, stage: str, progress: float) -> None:
        job.stage = stage
        job.progress = progress
        self.db.commit()

    def _input_asset(self, job: Job) -> Asset | None:
        if job.input_asset_id is None:
            return None
        asset = self.db.get(Asset, job.input_asset_id)
        if asset is None:
            raise LookupError("generation input asset not found")
        if asset.status != AssetStatus.READY.value:
            raise ValueError("generation input asset must be READY")
        return asset

    def _download_input(self, asset: Asset, root: Path, job: Job) -> Path:
        suffix = Path(asset.filename).suffix or ".input"
        path = root / f"input{suffix}"
        self._stage(job, "downloading generation input", 0.05)
        self.storage.download_file(asset.storage_key, path)
        return path

    @staticmethod
    def _resolution(job: Job) -> tuple[dict, dict, dict | None]:
        resolution = job.spec_json.get("resolution")
        if not isinstance(resolution, dict):
            raise ValueError("generation job has no execution resolution")
        workflow = resolution.get("workflow")
        model = resolution.get("model")
        if not isinstance(workflow, dict):
            raise ValueError("generation job has no workflow snapshot")
        if model is not None and not isinstance(model, dict):
            raise ValueError("generation model snapshot is invalid")
        return resolution, workflow, model

    def _create_output_asset(
        self,
        job: Job,
        input_asset: Asset | None,
        output_path: Path,
        external_id: str,
        output_ref: dict,
    ) -> Asset:
        resolution, workflow, model = self._resolution(job)
        probe: dict = {}
        probe_error: str | None = None
        try:
            probe = probe_media(str(output_path), self.settings)
        except MediaProbeError as exc:
            probe_error = str(exc)

        filename = Path(output_path.name).name or f"generation-{job.id[:8]}.mp4"
        mime_type = mimetypes.guess_type(filename)[0] or "video/mp4"
        metadata = {
            "generation": {
                "job_id": job.id,
                "capability": job.spec_json.get("capability"),
                "engine": resolution.get("engine"),
                "external_id": external_id,
                "seed": job.spec_json.get("seed"),
                "workflow": {
                    "id": workflow.get("id"),
                    "name": workflow.get("name"),
                    "version": workflow.get("version"),
                },
                "model": (
                    {
                        "id": model.get("id"),
                        "name": model.get("name"),
                        "version": model.get("version"),
                    }
                    if model is not None
                    else None
                ),
                "executor_output": output_ref,
            },
            "probe": probe,
        }
        if probe_error:
            metadata["probe_error"] = probe_error

        asset = Asset(
            project_id=job.project_id,
            type=MediaAssetType.VIDEO.value,
            status=AssetStatus.PROCESSING.value,
            filename=filename,
            mime_type=mime_type,
            size=output_path.stat().st_size,
            storage_bucket=self.storage.bucket,
            storage_key="pending",
            width=probe.get("width"),
            height=probe.get("height"),
            duration=probe.get("duration"),
            fps=probe.get("fps"),
            frame_count=probe.get("frame_count"),
            codec=probe.get("video_codec"),
            audio_codec=probe.get("audio_codec"),
            metadata_json=metadata,
        )
        self.db.add(asset)
        self.db.flush()
        asset.storage_key = self.storage.build_asset_key(job.project_id, asset.id, filename)
        self.storage.upload_file(output_path, asset.storage_key, mime_type)
        asset.status = AssetStatus.READY.value

        if input_asset is not None:
            self.db.add(
                AssetLineage(
                    source_asset_id=input_asset.id,
                    derived_asset_id=asset.id,
                    job_id=job.id,
                    operator="generate",
                    metadata_json={
                        "capability": job.spec_json.get("capability"),
                        "engine": resolution.get("engine"),
                        "workflow_id": workflow.get("id"),
                        "model_id": model.get("id") if model is not None else None,
                        "seed": job.spec_json.get("seed"),
                    },
                )
            )
        return asset

    def _generate(self, job: Job) -> None:
        resolution, _, _ = self._resolution(job)
        engine = resolution.get("engine")
        if engine != "comfyui":
            raise ValueError(f"unsupported generation engine: {engine}")

        input_asset = self._input_asset(job)
        with TemporaryDirectory(prefix="videoweave-generation-") as temp_dir:
            root = Path(temp_dir)
            input_path = self._download_input(input_asset, root, job) if input_asset else None

            adapter = ComfyUIAdapter(self.settings)
            result = adapter.execute(
                spec=job.spec_json,
                workdir=root,
                input_path=input_path,
                on_stage=lambda stage, progress: self._stage(job, stage, progress),
            )

            self._stage(job, "registering generated asset", 0.9)
            output_asset = self._create_output_asset(
                job,
                input_asset,
                result.output_path,
                result.external_id,
                result.output_ref,
            )
            job.result_json = {
                "execution_status": "completed",
                "engine": "comfyui",
                "external_id": result.external_id,
                "output_asset_id": output_asset.id,
                "output_asset_ids": [output_asset.id],
                "executor_output": result.output_ref,
                "diagnostics": result.diagnostics,
            }
            job.stage = "finalizing"
            job.progress = 0.96
            self.db.commit()
