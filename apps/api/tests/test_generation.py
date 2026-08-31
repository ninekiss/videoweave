from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from videoweave_api.db.base import Base
from videoweave_api.db.models import Asset, Project
from videoweave_api.domain.enums import AssetStatus, Capability, JobState, JobType, MediaAssetType
from videoweave_api.schemas import GenerationCreate, ModelDefinitionCreate, WorkflowDefinitionCreate
from videoweave_api.services.generations import GenerationService
from videoweave_api.services.registry import RegistryService


def _register(db: Session, capability: Capability) -> tuple[str, str]:
    registry = RegistryService(db)
    model = registry.create_model(
        ModelDefinitionCreate(
            name=f"Example {capability.value} Model",
            capability=capability,
            engine="comfyui",
            location="models/example.safetensors",
        )
    )
    workflow = registry.create_workflow(
        WorkflowDefinitionCreate(
            name=f"Example {capability.value} Workflow",
            capability=capability,
            engine="comfyui",
            model_id=model.id,
            artifact_ref=f"workflows/{capability.value}.json",
        )
    )
    return workflow.id, model.id


def test_text_to_video_generation_snapshots_resolution() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        project = Project(name="Generation Test")
        db.add(project)
        db.commit()
        db.refresh(project)
        workflow_id, model_id = _register(db, Capability.TEXT_TO_VIDEO)

        job = GenerationService(db).create_generation(
            project.id,
            GenerationCreate(
                capability=Capability.TEXT_TO_VIDEO,
                prompt="A slow cinematic camera move over a mountain lake",
                seed=42,
            ),
        )

        assert job.type == JobType.GENERATION.value
        assert job.state == JobState.PENDING.value
        assert job.stage == "resolved"
        assert job.input_asset_id is None
        assert job.spec_json["resolution"]["engine"] == "comfyui"
        assert job.spec_json["resolution"]["workflow"]["id"] == workflow_id
        assert job.spec_json["resolution"]["model"]["id"] == model_id
        assert job.result_json["execution_status"] == "awaiting-adapter"


def test_image_to_video_generation_keeps_ready_image_input() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        project = Project(name="I2V Test")
        db.add(project)
        db.commit()
        db.refresh(project)
        _register(db, Capability.IMAGE_TO_VIDEO)
        image = Asset(
            project_id=project.id,
            type=MediaAssetType.IMAGE.value,
            status=AssetStatus.READY.value,
            filename="reference.png",
            mime_type="image/png",
            size=123,
            storage_bucket="videoweave",
            storage_key=f"projects/{project.id}/reference.png",
        )
        db.add(image)
        db.commit()
        db.refresh(image)

        job = GenerationService(db).create_generation(
            project.id,
            GenerationCreate(
                capability=Capability.IMAGE_TO_VIDEO,
                prompt="Subtle wind moves the grass and hair",
                input_asset_id=image.id,
            ),
        )

        assert job.input_asset_id == image.id
        assert job.spec_json["input_asset_id"] == image.id
        assert job.spec_json["capability"] == Capability.IMAGE_TO_VIDEO.value
