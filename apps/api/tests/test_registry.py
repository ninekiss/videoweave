from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from videoweave_api.db.base import Base
from videoweave_api.domain.enums import Capability
from videoweave_api.schemas import ModelDefinitionCreate, WorkflowDefinitionCreate
from videoweave_api.services.registry import RegistryService


def test_registry_resolves_available_model_workflow() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        service = RegistryService(db)
        model = service.create_model(
            ModelDefinitionCreate(
                name="Example I2V Model",
                capability=Capability.IMAGE_TO_VIDEO,
                engine="comfyui",
                location="models/example.safetensors",
            )
        )
        workflow = service.create_workflow(
            WorkflowDefinitionCreate(
                name="Example I2V Workflow",
                capability=Capability.IMAGE_TO_VIDEO,
                engine="comfyui",
                model_id=model.id,
                artifact_ref="workflows/example-i2v.json",
            )
        )

        resolved_workflow, resolved_model = service.resolve(Capability.IMAGE_TO_VIDEO)

        assert resolved_workflow.id == workflow.id
        assert resolved_model is not None
        assert resolved_model.id == model.id
