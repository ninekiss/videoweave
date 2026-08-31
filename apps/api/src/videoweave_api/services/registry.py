from sqlalchemy import select
from sqlalchemy.orm import Session

from videoweave_api.db.models import ModelDefinition, WorkflowDefinition
from videoweave_api.domain.enums import Capability
from videoweave_api.schemas import ModelDefinitionCreate, WorkflowDefinitionCreate


class RegistryService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_model(self, payload: ModelDefinitionCreate) -> ModelDefinition:
        model = ModelDefinition(
            name=payload.name.strip(),
            family=payload.family,
            version=payload.version,
            capability=payload.capability.value,
            engine=payload.engine.strip(),
            location=payload.location,
            status=payload.status,
            config_json=payload.config,
        )
        self.db.add(model)
        self.db.commit()
        self.db.refresh(model)
        return model

    def list_models(
        self,
        capability: Capability | None = None,
        engine: str | None = None,
    ) -> list[ModelDefinition]:
        statement = select(ModelDefinition).order_by(ModelDefinition.created_at.desc())
        if capability is not None:
            statement = statement.where(ModelDefinition.capability == capability.value)
        if engine:
            statement = statement.where(ModelDefinition.engine == engine)
        return list(self.db.scalars(statement))

    def create_workflow(self, payload: WorkflowDefinitionCreate) -> WorkflowDefinition:
        model: ModelDefinition | None = None
        if payload.model_id is not None:
            model = self.db.get(ModelDefinition, payload.model_id)
            if model is None:
                raise ValueError("model not found")
            if model.capability != payload.capability.value:
                raise ValueError("workflow capability does not match model capability")
            if model.engine != payload.engine:
                raise ValueError("workflow engine does not match model engine")

        workflow = WorkflowDefinition(
            name=payload.name.strip(),
            version=payload.version,
            capability=payload.capability.value,
            engine=payload.engine.strip(),
            model_id=model.id if model is not None else None,
            enabled=payload.enabled,
            artifact_ref=payload.artifact_ref,
            config_json=payload.config,
        )
        self.db.add(workflow)
        self.db.commit()
        self.db.refresh(workflow)
        return workflow

    def list_workflows(
        self,
        capability: Capability | None = None,
        engine: str | None = None,
        enabled: bool | None = None,
    ) -> list[WorkflowDefinition]:
        statement = select(WorkflowDefinition).order_by(WorkflowDefinition.created_at.desc())
        if capability is not None:
            statement = statement.where(WorkflowDefinition.capability == capability.value)
        if engine:
            statement = statement.where(WorkflowDefinition.engine == engine)
        if enabled is not None:
            statement = statement.where(WorkflowDefinition.enabled == enabled)
        return list(self.db.scalars(statement))

    def resolve(
        self,
        capability: Capability,
    ) -> tuple[WorkflowDefinition, ModelDefinition | None]:
        workflows = self.list_workflows(capability=capability, enabled=True)
        for workflow in workflows:
            if workflow.model_id is None:
                return workflow, None
            model = self.db.get(ModelDefinition, workflow.model_id)
            if model is not None and model.status == "AVAILABLE":
                return workflow, model
        raise LookupError(f"no executable workflow registered for {capability.value}")
