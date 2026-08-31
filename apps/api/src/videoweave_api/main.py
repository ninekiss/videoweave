from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from videoweave_api.api.routes.capabilities import router as capabilities_router
from videoweave_api.api.routes.foundation import router as foundation_router
from videoweave_api.api.routes.health import router as health_router
from videoweave_api.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="VideoWeave API",
    version="0.0.0",
    description="Capability-first control plane for VideoWeave.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(capabilities_router, prefix="/v1")
app.include_router(foundation_router, prefix="/v1")
