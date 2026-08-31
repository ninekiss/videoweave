from datetime import datetime, timezone
import secrets

from sqlalchemy.orm import Session

from videoweave_api.db.models import Asset, Job, ModelDefinition, Project, WorkflowDefinition
from videoweave_api.domain.enums import AssetStatus, Capability, JobState, JobType, MediaAssetType
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.schemas import GenerationCreate
from videoweave_api.services.registry import RegistryService


class GenerationService:
    def __init__(self, db: Session, queue: RedisJobQueue) -> None:
        self.db = db
        self.queue = queue

    @staticmethod
    def _workflow_snapshot(workflow: WorkflowDefinition) -> dict:
        return {
            "id": workflow.id,
            "name": workflow.name,
            "version": workflow.version,
            "engine": workflow.engine,
            "artifact_ref": workflow.artifact_ref,
            "config": workflow.config_json,
        }

    @staticmethod
    def _model_snapshot(model: ModelDefinition | None) -> dict | None:
        if model is None:
            return None
        return {
            "id": model.id,
            "name": model.name,
            "family": model.family,
            "version": model.version,
            "engine": model.engine,
            "location": model.location,
            "config": model.config_json,
        }

    def _input_asset(self, project_id: str, payload: GenerationCreate) -> Asset | None:
        if payload.capability == Capability.TEXT_TO_VIDEO:
            return None

        asset = self.db.get(Asset, payload.input_asset_id)
        if asset is None:
            raise LookupError("input asset not found")
        if asset.project_id != project_id:
            raise ValueError("input asset belongs to another project")
        if asset.type != MediaAssetType.IMAGE.value:
            raise ValueError("image-to-video requires an IMAGE asset")
        if asset.status != AssetStatus.READY.value:
            raise ValueError("input asset must be READY")
        return asset

    @staticmethod
    def _validate_execution_target(workflow: WorkflowDefinition, payload: GenerationCreate) -> None:
        if workflow.engine != "comfyui":
            raise ValueError(f"no execution adapter is available for engine {workflow.engine}")
        if not workflow.artifact_ref:
            raise ValueError("ComfyUI workflow requires artifact_ref")

        config = workflow.config_json if isinstance(workflow.config_json, dict) else {}
        bindings = config.get("bindings")
        if not isinstance(bindings, dict):
            raise ValueError("ComfyUI workflow config requires bindings")

        required = {"prompt", "seed"}
        if payload.capability == Capability.IMAGE_TO_VIDEO:
            required.add("input_image")
        missing = sorted(name for name in required if name not in bindings)
        if missing:
            raise ValueError(f"ComfyUI workflow is missing required bindings: {', '.join(missing)}")

    def _enqueue(self, job: Job) -> Job:
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        try:
            self.queue.enqueue(job.id)
        except Exception as exc:
            job.state = JobState.FAILED.value
            job.stage = "queue"
            job.error = f"could not enqueue generation job: {exc}"
            job.finished_at = datetime.now(timezone.utc)
            self.db.commit()
            raise RuntimeError("could not enqueue generation job") from exc
        return job

    def create_generation(self, project_id: str, payload: GenerationCreate) -> Job:
        project = self.db.get(Project, project_id)
        if project is None:
            raise LookupError("project not found")

        input_asset = self._input_asset(project_id, payload)
        try:
            workflow, model = RegistryService(self.db).resolve(payload.capability)
        except LookupError as exc:
            raise ValueError(str(exc)) from exc

        self._validate_execution_target(workflow, payload)
        seed = payload.seed if payload.seed is not None else secrets.randbits(63)

        job = Job(
            project_id=project.id,
            type=JobType.GENERATION.value,
            state=JobState.QUEUED.value,
            progress=0.0,
            stage="queued",
            input_asset_id=input_asset.id if input_asset is not None else None,
            spec_json={
                "capability": payload.capability.value,
                "prompt": payload.prompt.strip(),
                "negative_prompt": payload.negative_prompt,
                "seed": seed,
                "parameters": payload.parameters,
                "input_asset_id": input_asset.id if input_asset is not None else None,
                "resolution": {
                    "engine": workflow.engine,
                    "workflow": self._workflow_snapshot(workflow),
                    "model": self._model_snapshot(model),
                },
            },
            result_json={
                "execution_status": "queued",
            },
        )
        return self._enqueue(job)
