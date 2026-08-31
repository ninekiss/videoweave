from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from videoweave_api.domain.enums import (
    AssetStatus,
    Capability,
    JobState,
    JobType,
    MediaAssetType,
    UploadStatus,
)


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


class AssetAccessRead(BaseModel):
    url: str
    expires_in: int


class AnalysisCleanupRead(BaseModel):
    analysis_jobs: int
    deleted_assets: int
    deleted_shots: int


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


class KeyframeExtractionCreate(BaseModel):
    count: int = Field(default=8, ge=1, le=24)


class SceneCandidateDetectionCreate(BaseModel):
    floor_threshold: float = Field(default=1.0, ge=0.1, le=20.0)


class VideoAnalysisCreate(BaseModel):
    mode: Literal["auto", "manual"] = "auto"
    scene_threshold: float | None = Field(default=None, ge=0.1, le=100.0)
    candidate_job_id: str | None = None


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    project_id: str
    type: JobType
    state: JobState
    progress: float
    stage: str | None
    input_asset_id: str | None
    spec: dict[str, Any] = Field(default_factory=dict, validation_alias="spec_json")
    result: dict[str, Any] = Field(default_factory=dict, validation_alias="result_json")
    error: str | None
    worker_id: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class ShotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    project_id: str
    source_asset_id: str
    analysis_job_id: str
    index: int
    start_time: float
    end_time: float
    duration: float
    representative_asset_id: str | None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="metadata_json")
    created_at: datetime


class ModelDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    family: str | None = Field(default=None, max_length=128)
    version: str | None = Field(default=None, max_length=128)
    capability: Capability
    engine: str = Field(min_length=1, max_length=64)
    location: str | None = Field(default=None, max_length=1024)
    status: Literal["AVAILABLE", "DISABLED", "MISSING"] = "AVAILABLE"
    config: dict[str, Any] = Field(default_factory=dict)


class ModelDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    family: str | None
    version: str | None
    capability: Capability
    engine: str
    location: str | None
    status: Literal["AVAILABLE", "DISABLED", "MISSING"]
    config: dict[str, Any] = Field(default_factory=dict, validation_alias="config_json")
    created_at: datetime


class WorkflowDefinitionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    version: str = Field(default="1", min_length=1, max_length=128)
    capability: Capability
    engine: str = Field(min_length=1, max_length=64)
    model_id: str | None = None
    enabled: bool = True
    artifact_ref: str | None = Field(default=None, max_length=1024)
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    version: str
    capability: Capability
    engine: str
    model_id: str | None
    enabled: bool
    artifact_ref: str | None
    config: dict[str, Any] = Field(default_factory=dict, validation_alias="config_json")
    created_at: datetime


class CapabilityResolutionRead(BaseModel):
    capability: Capability
    workflow: WorkflowDefinitionRead
    model: ModelDefinitionRead | None
