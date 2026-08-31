from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from videoweave_api.domain.enums import AssetStatus, MediaAssetType, UploadStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class AssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    project_id: str
    type: MediaAssetType
    status: AssetStatus
    filename: str
    mime_type: str | None
    size: int | None
    width: int | None
    height: int | None
    duration: float | None
    fps: float | None
    frame_count: int | None
    codec: str | None
    audio_codec: str | None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_json")
    created_at: datetime


class UploadCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=512)
    mime_type: str | None = Field(default=None, max_length=255)
    size: int | None = Field(default=None, ge=0)
    asset_type: MediaAssetType = MediaAssetType.VIDEO


class UploadInitRead(BaseModel):
    upload_session_id: str
    asset_id: str
    part_size: int


class UploadPartRead(BaseModel):
    part_number: int
    url: str
    expires_in: int


class CompletedPart(BaseModel):
    part_number: int = Field(ge=1, le=10000)
    etag: str = Field(min_length=1)


class UploadCompleteRequest(BaseModel):
    parts: list[CompletedPart] = Field(min_length=1)


class UploadedPart(BaseModel):
    part_number: int
    etag: str
    size: int


class UploadStatusRead(BaseModel):
    upload_session_id: str
    asset_id: str
    status: UploadStatus
    parts: list[UploadedPart]
