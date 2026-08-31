export const capabilities = [
  "text-to-video",
  "image-to-video",
  "first-last-frame-to-video",
  "keyframe-to-video",
  "video-to-video",
  "video-analysis",
  "keyframe-extraction",
  "video-replication",
  "frame-interpolation",
  "temporal-generation",
  "temporal-repair",
  "video-upscale",
  "composition",
  "transcode",
] as const;

export type Capability = (typeof capabilities)[number];

export type MediaAssetType =
  | "IMAGE"
  | "VIDEO"
  | "LIVE"
  | "AUDIO"
  | "FRAME_SEQUENCE"
  | "MASK"
  | "SUBTITLE"
  | "ANALYSIS";

export type AssetStatus =
  | "UPLOADING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "CANCELLED";

export type UploadStatus = "ACTIVE" | "COMPLETED" | "ABORTED";

export type JobType = "keyframe-extraction";

export type JobState =
  | "PENDING"
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface Project {
  id: string;
  name: string;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  project_id: string;
  type: MediaAssetType;
  status: AssetStatus;
  filename: string;
  mime_type: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  fps: number | null;
  frame_count: number | null;
  codec: string | null;
  audio_codec: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AssetAccess {
  url: string;
  expires_in: number;
}

export interface UploadSession {
  upload_session_id: string;
  asset_id: string;
  part_size: number;
}

export interface UploadPartAccess {
  part_number: number;
  url: string;
  expires_in: number;
}

export interface UploadedPart {
  part_number: number;
  etag: string;
  size: number;
}

export interface UploadStatusResponse {
  upload_session_id: string;
  asset_id: string;
  status: UploadStatus;
  parts: UploadedPart[];
}

export interface Job {
  id: string;
  project_id: string;
  type: JobType;
  state: JobState;
  progress: number;
  stage: string | null;
  input_asset_id: string | null;
  spec: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  worker_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface KeyframeResult {
  asset_id: string;
  timestamp: number;
  index: number;
}

export interface GenerationSpec {
  capability: Capability;
  prompt?: string;
  inputAssetIds: string[];
  model?: string;
  workflow?: string;
  seed?: number;
  parameters?: Record<string, unknown>;
}
