from enum import StrEnum


class Capability(StrEnum):
    TEXT_TO_VIDEO = "text-to-video"
    IMAGE_TO_VIDEO = "image-to-video"
    FIRST_LAST_FRAME_TO_VIDEO = "first-last-frame-to-video"
    KEYFRAME_TO_VIDEO = "keyframe-to-video"
    VIDEO_TO_VIDEO = "video-to-video"
    VIDEO_ANALYSIS = "video-analysis"
    KEYFRAME_EXTRACTION = "keyframe-extraction"
    VIDEO_REPLICATION = "video-replication"
    FRAME_INTERPOLATION = "frame-interpolation"
    TEMPORAL_GENERATION = "temporal-generation"
    TEMPORAL_REPAIR = "temporal-repair"
    VIDEO_UPSCALE = "video-upscale"
    COMPOSITION = "composition"
    TRANSCODE = "transcode"


class JobType(StrEnum):
    GENERATION = "generation"
    KEYFRAME_EXTRACTION = "keyframe-extraction"
    SCENE_DETECTION = "scene-detection"
    VIDEO_ANALYSIS = "video-analysis"


class JobState(StrEnum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MediaAssetType(StrEnum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"
    LIVE = "LIVE"
    AUDIO = "AUDIO"
    FRAME_SEQUENCE = "FRAME_SEQUENCE"
    MASK = "MASK"
    SUBTITLE = "SUBTITLE"
    ANALYSIS = "ANALYSIS"


class AssetStatus(StrEnum):
    UPLOADING = "UPLOADING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class UploadStatus(StrEnum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"
