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

export type JobState =
  | "PENDING"
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface GenerationSpec {
  capability: Capability;
  prompt?: string;
  inputAssetIds: string[];
  model?: string;
  workflow?: string;
  seed?: number;
  parameters?: Record<string, unknown>;
}
