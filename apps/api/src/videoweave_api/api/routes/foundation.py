from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from videoweave_api.api.deps import get_db, get_storage
from videoweave_api.core.config import get_settings
from videoweave_api.infrastructure.storage.s3 import S3Storage
from videoweave_api.schemas import (
    AssetRead,
    ProjectCreate,
    ProjectRead,
    UploadCompleteRequest,
    UploadCreate,
    UploadInitRead,
    UploadPartRead,
    UploadStatusRead,
    UploadedPart,
)
from videoweave_api.services.foundation import FoundationService

router = APIRouter(tags=["foundation"])


def _service(db: Session, storage: S3Storage) -> FoundationService:
    return FoundationService(db, storage, get_settings())


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> ProjectRead:
    return _service(db, storage).create_project(payload)


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> list[ProjectRead]:
    return _service(db, storage).list_projects()


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> ProjectRead:
    try:
        return _service(db, storage).get_project(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/projects/{project_id}/assets", response_model=list[AssetRead])
def list_project_assets(
    project_id: str,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> list[AssetRead]:
    try:
        return _service(db, storage).list_assets(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/assets/{asset_id}", response_model=AssetRead)
def get_asset(
    asset_id: str,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> AssetRead:
    try:
        return _service(db, storage).get_asset(asset_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/projects/{project_id}/uploads", response_model=UploadInitRead, status_code=201)
def initialize_upload(
    project_id: str,
    payload: UploadCreate,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> UploadInitRead:
    try:
        upload, asset = _service(db, storage).initialize_upload(project_id, payload)
        return UploadInitRead(
            upload_session_id=upload.id,
            asset_id=asset.id,
            part_size=upload.part_size,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/uploads/{upload_session_id}/parts/{part_number}", response_model=UploadPartRead)
def create_upload_part_url(
    upload_session_id: str,
    part_number: int,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> UploadPartRead:
    try:
        url = _service(db, storage).presign_part(upload_session_id, part_number)
        return UploadPartRead(
            part_number=part_number,
            url=url,
            expires_in=get_settings().s3_presign_expiry_seconds,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/uploads/{upload_session_id}", response_model=UploadStatusRead)
def get_upload_status(
    upload_session_id: str,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> UploadStatusRead:
    try:
        upload, parts = _service(db, storage).upload_status(upload_session_id)
        return UploadStatusRead(
            upload_session_id=upload.id,
            asset_id=upload.asset_id,
            status=upload.status,
            parts=[
                UploadedPart(
                    part_number=part["PartNumber"],
                    etag=part["ETag"],
                    size=part["Size"],
                )
                for part in parts
            ],
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/uploads/{upload_session_id}/complete", response_model=AssetRead)
def complete_upload(
    upload_session_id: str,
    payload: UploadCompleteRequest,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> AssetRead:
    try:
        return _service(db, storage).complete_upload(upload_session_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/uploads/{upload_session_id}", status_code=204)
def abort_upload(
    upload_session_id: str,
    db: Session = Depends(get_db),
    storage: S3Storage = Depends(get_storage),
) -> Response:
    try:
        _service(db, storage).abort_upload(upload_session_id)
        return Response(status_code=204)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
