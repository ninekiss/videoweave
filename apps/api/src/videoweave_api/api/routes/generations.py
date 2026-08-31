from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from videoweave_api.api.deps import get_db, get_job_queue
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.schemas import GenerationCreate, JobRead
from videoweave_api.services.generations import GenerationService

router = APIRouter(tags=["generations"])


@router.post("/projects/{project_id}/generations", response_model=JobRead, status_code=202)
def create_generation(
    project_id: str,
    payload: GenerationCreate,
    db: Session = Depends(get_db),
    queue: RedisJobQueue = Depends(get_job_queue),
) -> JobRead:
    try:
        return GenerationService(db, queue).create_generation(project_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
