from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from videoweave_api.api.routes.capabilities import router as capabilities_router
from videoweave_api.api.routes.foundation import router as foundation_router
from videoweave_api.api.routes.generations import router as generations_router
from videoweave_api.api.routes.health import router as health_router
from videoweave_api.api.routes.jobs import router as jobs_router
from videoweave_api.api.routes.registry import router as registry_router
from videoweave_api.core.config import get_settings

settings = get_settings()

api = FastAPI(
    title="VideoWeave API",
    version="0.0.0",
    description="Capability-first control plane for VideoWeave.",
)

api.include_router(health_router)
api.include_router(capabilities_router, prefix="/v1")
api.include_router(foundation_router, prefix="/v1")
api.include_router(jobs_router, prefix="/v1")
api.include_router(registry_router, prefix="/v1")
api.include_router(generations_router, prefix="/v1")

# Keep CORS outside FastAPI's ServerErrorMiddleware so even unexpected 500
# responses remain readable by the browser during local development.
app = CORSMiddleware(
    app=api,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
