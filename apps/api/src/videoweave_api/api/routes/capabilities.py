from fastapi import APIRouter

from videoweave_api.domain.enums import Capability

router = APIRouter(tags=["capabilities"])


@router.get("/capabilities")
def list_capabilities() -> dict[str, list[str]]:
    return {"capabilities": [capability.value for capability in Capability]}
