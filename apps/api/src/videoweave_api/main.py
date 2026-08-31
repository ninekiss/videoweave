from fastapi import FastAPI

from videoweave_api.api.routes.capabilities import router as capabilities_router
from videoweave_api.api.routes.health import router as health_router

app = FastAPI(
    title="VideoWeave API",
    version="0.0.0",
    description="Capability-first control plane for VideoWeave.",
)

app.include_router(health_router)
app.include_router(capabilities_router, prefix="/v1")
