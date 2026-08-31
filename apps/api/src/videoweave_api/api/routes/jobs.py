from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from videoweave_api.api.deps import get_db, get_job_queue
from videoweave_api.infrastructure.jobs.queue import RedisJobQueue
from videoweave_api.schemas import JobRead, KeyframeExtractionCreate
from videoweave_api.services.jobs import JobService

router = APIRouter(tags=["jobs"])


def _service(db: Session, queue: RedisJobQueue) -> JobService:
    return JobService(db, queue)


@router.post("/assets/{asset_id}/keyframes", response_model=JobRead, status_code=202)
def create_keyframe_extraction(
    asset_id: str,
    payload: KeyframeExtractionCreate,
    db: Session = Depends(get_db),
    queue: RedisJobQueue = Depends(get_job_queue),
) -> JobRead:
    try:
        return _service(db, queue).create_keyframe_extraction(asset_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    queue: RedisJobQueue = Depends(get_job_queue),
) -> list[JobRead]:
    return _service(db, queue).list_jobs(project_id)


@router.get("/jobs/{job_id}", response_model=JobRead)
def get_job(
    job_id: str,
    db: Session = Depends(get_db),
    queue: RedisJobQueue = Depends(get_job_queue),
) -> JobRead:
    try:
        return _service(db, queue).get_job(job_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
