# AGENTS.md — VideoWeave

This file defines the long-term operating rules for coding agents working on VideoWeave.

## 1. Mission

Build a production-oriented workbench for video generation, understanding, keyframe extraction, visual reverse engineering, video replication, temporal reconstruction, interpolation, generative frame completion, temporal repair, upscale, composition, transcoding, resumable transfer, S3-compatible storage and reproducible media pipelines.

The product exposes stable capabilities while allowing models, workflows, runtimes and infrastructure to change.

## 2. Architectural Rule Zero

Never couple domain/product logic directly to:

- a specific video model
- a specific ComfyUI graph
- Diffusers internals
- a specific object-storage vendor
- a specific queue vendor
- a specific GPU provider

Replaceable technology must live behind adapters, registries or infrastructure interfaces.

## 3. Stable Domain Concepts

Treat these as long-lived contracts:

- Project
- MediaAsset
- AssetVariant
- AssetLineage
- Job
- Worker
- Capability
- Operator
- WorkflowDefinition
- ModelDefinition
- Pipeline
- GenerationSpec
- AnalysisSpec
- ReverseSpec
- ReplicationSpec
- InterpolationSpec
- TemporalGenerationSpec
- TemporalRepairSpec
- UpscaleSpec
- CompositionSpec
- EncodeSpec
- TransferSpec
- Shot
- Keyframe
- VideoGraph
- TemporalEdge

Implementations may change; these concepts should remain stable.

## 4. Capability-first

User-facing flows begin with a capability.

Good: `image-to-video`

Bad: `wan-x-comfy-workflow-abc`

Expected flow:

```text
Capability
→ Spec
→ Resolver
→ Workflow / Model Selection
→ Adapter
→ Executor
→ Job
→ Output Assets
```

## 5. Operator Model

Known Operators:

- Generate
- Analyze
- ExtractFrame
- Reverse
- DetectShot
- DetectScene
- Interpolate
- TemporalGenerate
- TemporalRepair
- Upscale
- Encode
- Compose
- Thumbnail
- Audio
- Transfer
- Export

Long-running compute should go through the Job system.

## 6. MediaAsset

High-level types:

```text
IMAGE
VIDEO
LIVE
AUDIO
FRAME_SEQUENCE
MASK
SUBTITLE
ANALYSIS
```

Temporal media includes video, Live Photo / Motion Photo, GIF, animated WebP, APNG and frame sequences.

Normalize conceptually as:

```text
Frames + Timeline + Audio + Metadata
```

Preserve format-specific metadata required to reconstruct the original media type.

## 7. Live Media

A Live Photo / Motion Photo is a composite temporal asset, not just a normal video.

Preserve:

- primary still image
- motion segment
- optional audio
- key timestamp
- platform metadata

Support Live → Still, Live → Video, Video → Live, motion extension, interpolation, upscale, motion regeneration and motion replication.

## 8. Storage

Binary media belongs in object storage. Metadata belongs in the database.

StorageAdapter should support S3-compatible backends such as MinIO, AWS S3, Cloudflare R2, Backblaze B2 and Wasabi.

Never encode AWS-only assumptions into domain logic.

## 9. Large File Transfer

Do not proxy large uploads/downloads through the API server.

Uploads should support multipart, chunking, resume, retry, parallel transfer, checksum, progress, pause and cancellation.

Downloads should support presigned URLs, HTTP Range, resume, expiration and CDN compatibility.

The API initializes, authorizes, signs, tracks, completes/aborts and registers Assets.

## 10. Asset Lineage

Every derived output must answer:

- what source Asset created this?
- what Job created this?
- what Operator created this?
- what Spec was used?
- what Model/Workflow version was used?

Prefer DAG-compatible lineage.

Never overwrite source media in-place.

## 11. Job System

Known types:

```text
generation
analysis
frame_extraction
reverse
shot_detection
scene_detection
temporal_generation
interpolation
temporal_repair
upscale
encode
compose
transfer
export
```

Canonical states:

```text
PENDING
QUEUED
RUNNING
PAUSED
SUCCEEDED
FAILED
CANCELLED
```

Track progress, stage, priority, retry_count, worker, start/end timestamps, errors, logs, spec snapshot, inputs and outputs.

Long-running operations should be restartable where practical.

## 12. Workers

Logical roles:

- Generation Worker
- Analysis Worker
- Media Worker
- Interpolation Worker
- Upscale Worker
- Transfer Worker

GPU-oriented: generation, VLM/vision analysis, upscale, interpolation, temporal generation.

CPU-oriented: FFmpeg, metadata parsing, thumbnails, packaging, transfer coordination.

Avoid occupying GPU slots with CPU-only post-processing.

## 13. Generation

Known capabilities:

- text-to-video
- image-to-video
- first-frame-to-video
- first-last-frame-to-video
- keyframe-to-video
- reference-to-video
- video-to-video
- video-extend
- video-inpaint
- shot-generation
- batch-generation

Use one stable GenerationSpec with namespaced/schema-based model extensions. Do not pollute core specs with every model parameter.

## 14. Keyframes

A Keyframe is a domain entity, not merely an image.

Suggested fields:

- id
- shot_id
- frame_asset_id
- timestamp
- frame_number
- visual_analysis
- reverse_prompt
- camera_state
- subject_state
- pose_state
- environment_state
- lighting_state
- quality_state

Extraction modes include first, last, interval, count, timestamp, scene boundary, shot boundary, content change, similarity clustering, representative frame and manual selection.

## 15. Video Analysis

Metadata analysis:

- resolution
- fps
- duration
- codec
- bitrate
- frame count
- audio codec
- color space
- HDR
- aspect ratio

Semantic analysis:

- scene detection
- shot detection
- object detection
- subject/character detection
- face tracking
- pose
- OCR
- motion
- camera motion
- blur/noise/artifact quality analysis

Results should be structured and machine-readable. Do not force downstream features to parse free-form prose when a typed field is appropriate.

## 16. Visual Reverse Engineering

Support structured reverse engineering of shot type, camera angle/movement, perspective, composition, subject, pose, clothing, environment, lighting, color, style, VFX and temporal motion context.

Output ReverseSpec plus optional human-readable prompt text.

Prefer evidence over invented detail.

## 17. VideoGraph

VideoGraph is the core model-independent representation for replication and temporal reconstruction.

Nodes = Keyframes.

Edges = TemporalEdges.

TemporalEdge may include duration, camera_motion, subject_motion, pose_transition, object_motion, lighting_transition, transition_type, motion_strength, timing and constraints.

The graph must be serializable, versionable and independent of any model conditioning format.

## 18. Video Replication

Replication is a first-class feature, not renamed V2V.

Canonical pipeline:

```text
Original Video
→ Analyze
→ Detect Shots
→ Extract Keyframes
→ Reverse Visual State
→ Reverse Motion
→ Reverse Camera
→ Build VideoGraph
→ Build Replication Plan
→ Keep/Edit/Regenerate Keyframes
→ Temporal Generation
→ Frame Interpolation
→ Temporal Repair
→ Composition
→ Upscale
→ Encode
→ Delivery
```

ReplicationSpec should support Capability Locks for Camera, Motion, Composition, Timing, Character, Clothing, Environment, Lighting and Style.

Selective preservation and selective replacement are required.

## 19. Temporal Processing

Keep these separate:

### Frame Interpolation

Preserve source visual states while increasing frame density. Potential adapters include RIFE, FILM and future engines.

### Temporal Generation

Generate new intermediate visual states between anchors using Keyframe A/B, camera condition, motion condition, duration and subject constraints.

### Temporal Repair

Repair missing frames, bad frames, jump frames, flicker, character drift and temporal discontinuity.

Do not collapse all three into one generic frame-fill abstraction.

## 20. Upscale

Independent Operator.

Potential adapters: Real-ESRGAN, SwinIR, video-specific SR, diffusion-based SR and future engines.

Keep user-facing presets simple: Fast, Balanced, Quality.

## 21. Composition / Encoding

Use FFmpeg as the default mature media engine unless there is a concrete reason not to.

Known operations: concat, trim, split, crop, resize, pad, overlay, transition, speed, reverse, image-sequence-to-video, audio merge/replace, subtitle and basic mask/overlay.

Known formats/codecs: MP4, MOV, WebM, H.264, H.265, AV1, AAC, Opus.

Support original, preview, proxy, delivery and archive variants.

## 22. Workflow Registry

WorkflowDefinition should include id, name, version, capability, engine, model, inputs, outputs, parameters, requirements, compatibility and workflow artifact/reference.

Workflow versions referenced by completed Jobs are immutable. Changes create a new version.

## 23. Model Registry

Track id, name, family, version, capability, engine, size, precision, VRAM requirements, local/remote location, status, compatibility and metadata.

Known status concepts: Not Installed, Downloading, Ready, Loading, Loaded, Unavailable, Error.

## 24. Executor Adapters

Known abstractions:

```text
ExecutionAdapter
├── ComfyUIAdapter
├── DiffusersAdapter
├── RemoteWorkerAdapter
├── APIAdapter
└── FutureAdapter
```

Never let UI pages or HTTP endpoints directly construct ComfyUI node graphs.

Resolve domain Specs into executor-specific requests inside resolver/adapter layers.

## 25. API Surface

Expected resources:

```text
/projects
/assets
/uploads
/downloads
/jobs
/pipelines
/generations
/replications
/analyses
/keyframes
/models
/workflows
/workers
```

Long-running work is asynchronous; creation endpoints should return Job/operation identifiers rather than hold requests open.

## 26. Control Plane vs Data Plane

Control Plane: API, projects, metadata, users, assets, jobs, scheduling, permissions, workflow/model registries.

Data Plane: large media, models, frames, GPU inference, CPU media processing, direct object-storage transfer.

Keep large binary traffic out of the Control Plane.

## 27. UI Information Architecture

Main navigation:

- Workspace
- Projects
- Assets
- Generate
- Replication
- Storyboard
- Jobs
- Results
- Models
- Workflows
- Settings

Preferred desktop shell:

```text
Left Navigation
+ Main Canvas / Preview
+ Right Inspector
+ Optional Bottom Timeline / Job Tray
```

Do not overload primary generation surfaces with low-level model parameters.

## 28. Page Rules

Workspace: recent projects/outputs, active jobs, storage, workers, quick actions.

Assets: grid/list, search/filter, metadata, analysis, variants, lineage, related jobs.

Generate: capability, prompt, input media, model/auto, aspect, resolution, duration, FPS, seed, quality; advanced settings in Inspector.

Replication: original/result previews, shot strip, keyframe strip, VideoGraph, analysis inspector, Capability Locks and Keep/Replace/Regenerate controls.

Keyframe Editor: current and neighboring keyframes, timestamp, shot context, reverse prompt, camera/subject state and Temporal Edge.

Storyboard: Shot Cards with reference, prompt, duration, first/last frame, camera, motion and status.

Jobs: progress, stage, worker, retry, cancel, pause/resume where supported, logs, errors.

Results: compare, branch, reproduce, copy parameters, use as input, extend, interpolate, upscale, replicate, export.

Timeline is P2 and intentionally smaller than a professional NLE.

## 29. Suggested Technology Baseline

Frontend: React, Next.js, TypeScript.

Backend: FastAPI, Pydantic.

Database: PostgreSQL.

Coordination: Redis-compatible layer.

Media: FFmpeg.

Generation execution: ComfyUI Adapter, Diffusers Adapter.

Storage: S3-compatible; MinIO for local development.

Observability: OpenTelemetry-compatible instrumentation.

Potential later: Temporal or equivalent durable workflow engine.

This is a baseline, not a permanent lock.

## 30. P0

Required:

- Workspace
- Projects
- Assets
- S3-compatible storage
- multipart/resumable upload
- presigned download
- asset metadata
- asset lineage
- Job system
- Worker system
- Model Registry
- Workflow Registry
- T2V
- I2V
- basic keyframe extraction
- basic video analysis
- FFmpeg pipeline
- encode/transcode
- thumbnail
- Results
- generation history
- reproduce

P0 contracts must reserve support for VideoGraph, TemporalEdge, ReplicationSpec, Interpolation, TemporalGeneration, TemporalRepair and Upscale.

## 31. P1

- advanced shot detection
- advanced keyframe extraction
- visual reverse engineering
- camera analysis
- motion analysis
- VideoGraph
- keyframe editor
- keyframe generation
- first/last-frame video generation
- video replication
- Capability Locks
- frame interpolation
- temporal generation
- temporal repair
- upscale
- composition
- batch generation
- storyboard
- Live Photo import/export

## 32. P2

- timeline
- V2V
- character consistency
- motion reference
- automatic shot generation
- audio generation
- subtitle
- advanced composition
- multi-GPU scheduling
- remote workers
- cloud GPU
- collaboration
- quotas
- multi-user
- agent automation
- plugin/workflow marketplace

## 33. Compatibility Rules

1. Prefer additive evolution over breaking changes.
2. Preserve public Specs whenever possible.
3. Version WorkflowDefinitions and serialized graph schemas.
4. Never silently reinterpret an existing field.
5. Add migrations for persisted schema changes.
6. Keep backward readers for stored Specs when practical.
7. Breaking migrations require an explicit migration plan.
8. Historical generated Assets must remain reproducible after newer models/workflows are installed.
9. Never overwrite workflow versions referenced by completed Jobs.
10. Never delete lineage required for historical reproduction.

## 34. Upgrade Rules

Infrastructure libraries may be upgraded regularly.

Migrate architecture only when the current dependency is unsupported, security requires it, performance blocks core requirements, compatibility makes maintenance unreasonable or a new architecture provides a materially unavailable capability.

Do not rewrite stable subsystems just because a newer framework exists.

## 35. Coding Rules for Agents

Before implementing a feature:

1. identify the Capability
2. identify input/output Asset types
3. identify the relevant Spec
4. determine whether an existing Operator applies
5. determine whether an Adapter is required
6. define Job behavior
7. define lineage behavior
8. define failure/retry behavior
9. define UI state
10. define tests

Do not start from the UI and bolt infrastructure underneath afterward.

## 36. Failure and Idempotency

Design long-running tasks for partial failure.

Where possible, make Job creation, object-upload completion and derived-asset registration idempotent. Retries must not unintentionally create duplicate final assets. Cancellation must leave source assets untouched. Temporary outputs must be garbage-collectable.

## 37. Security

- never expose storage credentials to the browser
- use short-lived signed URLs
- validate uploaded media metadata
- enforce project/asset ownership
- isolate worker credentials
- never shell untrusted user strings directly into FFmpeg commands
- validate workflow/model identifiers
- restrict arbitrary filesystem paths
- treat untrusted model/workflow code as a trust-boundary concern

## 38. Observability

Every Job should answer:

- where is it running?
- what stage is active?
- what inputs were used?
- what workflow/model version is running?
- why did it fail?
- how long did each stage take?
- what GPU/CPU resources were consumed?

Prefer structured logs and trace IDs.

## 39. Testing

Unit: Specs, resolvers, lineage, state machines, capability compatibility.

Integration: storage, upload completion, Job execution, FFmpeg, adapters.

E2E P0: upload → generate → result; video → keyframes; generation → transcode → download; failed job → retry; resumable upload.

P1 adds video → reverse → VideoGraph, keyframe regeneration, replication pipeline, interpolation/repair/upscale.

## 40. Non-goals

Do not turn VideoWeave into a full Premiere/DaVinci replacement, a ComfyUI frontend clone, a model downloader with a thin UI, a monolithic inference process or a vendor-specific cloud application.

The durable product value is the capability layer and reproducible production workflow.

## 41. Decision Heuristic

Prefer choices that preserve domain contracts, minimize coupling, keep historical Jobs reproducible, keep media transfer outside the API server, allow model/workflow replacement, allow local-first development, avoid over-engineering P0 and preserve clean P1/P2 extension points.

## 42. Product Mental Model

```text
Understand
   ↓
Decompose
   ↓
Reverse
   ↓
Generate
   ↓
Reconstruct
   ↓
Process
   ↓
Compose
   ↓
Deliver
```

This mental model is more important than any individual model, framework or workflow engine.
