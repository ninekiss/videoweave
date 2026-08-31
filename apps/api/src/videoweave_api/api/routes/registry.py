from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from videoweave_api.api.deps import get_db
from videoweave_api.domain.enums import Capability
from videoweave_api.schemas import (
    CapabilityResolutionRead,
    ModelDefinitionCreate,
    ModelDefinitionRead,
    WorkflowDefinitionCreate,
    WorkflowDefinitionRead,
)
from videoweave_api.services.registry import RegistryService

router = APIRouter(tags=["registry"])


def _service(db: Session) -> RegistryService:
    return RegistryService(db)


@router.post("/models", response_model=ModelDefinitionRead, status_code=201)
def create_model(
    payload: ModelDefinitionCreate,
    db: Session = Depends(get_db),
) -> ModelDefinitionRead:
    return _service(db).create_model(payload)


@router.get("/models", response_model=list[ModelDefinitionRead])
def list_models(
    capability: Capability | None = None,
    engine: str | None = None,
    db: Session = Depends(get_db),
) -> list[ModelDefinitionRead]:
    return _service(db).list_models(capability=capability, engine=engine)


@router.post("/workflows", response_model=WorkflowDefinitionRead, status_code=201)
def create_workflow(
    payload: WorkflowDefinitionCreate,
    db: Session = Depends(get_db),
) -> WorkflowDefinitionRead:
    try:
        return _service(db).create_workflow(payload)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/workflows", response_model=list[WorkflowDefinitionRead])
def list_workflows(
    capability: Capability | None = None,
    engine: str | None = None,
    enabled: bool | None = None,
    db: Session = Depends(get_db),
) -> list[WorkflowDefinitionRead]:
    return _service(db).list_workflows(capability=capability, engine=engine, enabled=enabled)


@router.get(
    "/capabilities/{capability}/resolution",
    response_model=CapabilityResolutionRead,
)
def resolve_capability(
    capability: Capability,
    db: Session = Depends(get_db),
) -> CapabilityResolutionRead:
    try:
        workflow, model = _service(db).resolve(capability)
        return CapabilityResolutionRead(
            capability=capability,
            workflow=WorkflowDefinitionRead.model_validate(workflow),
            model=ModelDefinitionRead.model_validate(model) if model is not None else None,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
