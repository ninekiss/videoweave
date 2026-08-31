# VideoWeave Project Plan (English)

Version: v0.1

## 1. Positioning

VideoWeave is a model-agnostic, workflow-agnostic, storage-portable and evolvable workbench for video generation and video processing. Its scope goes beyond prompt-to-video and covers understanding, decomposition, reverse engineering, generation, reconstruction, processing, composition and delivery.

Core mental model:

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

## 2. Core Principles

- Capability-first: users choose what they want to do before the system resolves models, workflows and executors.
- Model-agnostic: business logic must not depend on one model.
- Workflow-agnostic: ComfyUI is an executor, not the application architecture.
- Storage-agnostic: use an S3-compatible Storage Adapter.
- Operator-first: generation, analysis, frame extraction, reverse engineering, interpolation, upscale, composition, encoding and transfer are Operators.
- Reproducible: results are traceable, reproducible, branchable and comparable.
- Control Plane / Data Plane separation: large files should not transit through the API server.

## 3. Known Functional Areas

### 3.1 Workspace / Projects

- Workspace home
- Project management
- Project-scoped Assets, Generations, Storyboards, Replication Tasks, Results and Settings
- Recent Projects / Recent Generations / Active Jobs / Storage Usage / GPU Workers

### 3.2 Assets

Supported high-level types:

- IMAGE
- VIDEO
- LIVE
- AUDIO
- FRAME_SEQUENCE
- MASK
- SUBTITLE
- ANALYSIS

Capabilities:

- upload / download
- search / filters / tags / sort
- grid / list
- metadata
- analysis
- variants
- lineage
- related jobs
- use as input
- analyze
- extract frames
- upscale
- interpolate
- replicate
- convert

### 3.3 Temporal Media

Videos, Live Photos / Motion Photos, GIF, APNG, animated WebP and frame sequences are normalized conceptually as:

```text
Frames + Timeline + Audio + Metadata
```

A Live Asset preserves:

- Primary Still Image
- Motion Segment
- Optional Audio
- Key Timestamp
- Platform Metadata

Supported conversions include Live → Still, Live → Video, Video → Live, Extend Motion, Smooth Motion, Regenerate Motion, Upscale Motion and Replicate Motion.

### 3.4 Generation

Supported capabilities:

- Text → Video
- Image → Video
- First Frame → Video
- First + Last Frame → Video
- Keyframe → Video
- Reference → Video
- Video → Video
- Video Extend
- Video Inpaint
- Shot Generation
- Batch Generation

Use a unified GenerationSpec.

### 3.5 Keyframes

A Keyframe is a first-class domain entity, not merely an image.

Suggested data:

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
- temporal_links

Extraction modes:

- First / Last Frame
- Fixed Interval
- Fixed Count
- Specific Timestamp
- Scene Boundary
- Shot Boundary
- Content Change
- Similarity Clustering
- Representative Frame
- Manual Selection

### 3.6 Video Analysis

Basic media analysis:

- Resolution
- FPS
- Duration
- Codec
- Bitrate
- Frame Count
- Audio Codec
- Color Space
- HDR
- Aspect Ratio

Content analysis:

- Scene Detection
- Shot Detection
- Object Detection
- Subject / Character Detection
- Face Tracking
- Pose
- OCR
- Motion Analysis
- Camera Motion
- Quality / Blur / Noise / Artifact Analysis

### 3.7 Visual Reverse Engineering

Structured dimensions:

- Shot Type
- Camera Angle
- Camera Movement
- Perspective
- Composition
- Subject
- Pose
- Clothing
- Environment
- Lighting
- Color
- Style
- Visual Effects
- Temporal Motion Context

Output a structured ReverseSpec plus optional human-readable prompt text.

### 3.8 VideoGraph

A model-independent intermediate representation for replication and temporal reconstruction.

Node = Keyframe Node.

Edge = Temporal Edge, potentially containing:

- duration
- camera_motion
- subject_motion
- pose_transition
- object_motion
- lighting_transition
- transition_type
- motion_strength
- timing
- constraints

### 3.9 Video Replication

Video Replication is a first-class capability and is not equivalent to ordinary V2V.

```text
Original Video
→ Analyze
→ Shot Detection
→ Keyframe Extraction
→ Visual Reverse
→ Motion Reverse
→ Camera Reverse
→ VideoGraph
→ Replication Plan
→ Keep / Edit / Regenerate Keyframes
→ Temporal Generation
→ Frame Interpolation
→ Temporal Repair
→ Composition
→ Upscale
→ Encode
→ Delivery
```

Capability Locks may preserve or replace:

- Camera
- Motion
- Composition
- Timing
- Character
- Clothing
- Environment
- Lighting
- Style

Replication modes may include Pixel-preserving Reconstruction, Keyframe-guided Reconstruction, Semantic Replication, Structure Transfer, Motion Transfer, Camera Transfer and Style Transfer.

### 3.10 Temporal Reconstruction

Keep these as three separate Operators:

1. Frame Interpolation — increase frame density while preserving source content.
2. Temporal Generation — generate new intermediate visual states between anchors.
3. Temporal Repair — repair missing frames, bad frames, jump frames, flicker, character drift and temporal discontinuity.

Interpolation adapters may include RIFE, FILM and future engines.

### 3.11 Upscale

Independent Operator.

Supported targets:

- 720p → 1080p
- 1080p → 2K
- 1080p → 4K
- x2 / x4 / Custom

Potential adapters include Real-ESRGAN, SwinIR, video-specific SR and diffusion-based upscale.

User-facing presets should remain Fast / Balanced / Quality.

### 3.12 Composition

Video operations: concat, trim, split, crop, resize, pad, overlay, transition, speed, reverse.

Image operations: image sequence → video, overlay, watermark, mask.

Audio operations: merge, replace, mute, music, normalize, voice track.

FFmpeg should be the default mature media engine.

### 3.13 Encode / Transcode

Containers: MP4, MOV, WebM.

Video codecs: H.264, H.265, AV1.

Audio: AAC, Opus.

Variants: Original, Preview, Proxy, Delivery, Archive.

### 3.14 S3 and Transfer

Large files must not transit through the API server.

```text
Client ↔ S3-compatible Storage
```

Backend responsibilities: authorization, presigned URLs, multipart state, complete/abort and Asset registration.

Uploads: Multipart, Chunking, Resume, Retry, Parallel Upload, Checksum, Progress, Pause, Cancel.

Downloads: Presigned Download, Range Request, Resume, CDN, Expiration, Partial Download.

StorageAdapter may target MinIO, AWS S3, Cloudflare R2, Backblaze B2, Wasabi and other compatible providers.

### 3.15 Asset Lineage

Every derived Asset records parent_asset_id, operation, job_id and spec_snapshot.

Example DAG:

```text
Original Video
├── Proxy
├── Thumbnail
├── Analysis
├── Keyframes
│   └── Regenerated Keyframes
│       └── Generated Shot
├── Interpolated Video
├── Upscaled Video
└── Final Composition
```

### 3.16 Job System

Known Job types: generation, analysis, frame_extraction, reverse, shot_detection, scene_detection, temporal_generation, interpolation, temporal_repair, upscale, encode, compose, transfer, export.

Canonical states: PENDING, QUEUED, RUNNING, PAUSED, SUCCEEDED, FAILED, CANCELLED.

Track progress, current_stage, retry_count, priority, worker_id, started_at, finished_at, error, logs and spec_snapshot.

### 3.17 Workers

Logical roles: Generation Worker, Analysis Worker, Media Worker, Interpolation Worker, Upscale Worker, Transfer Worker.

GPU-oriented: Generation, VLM Analysis, Upscale, Interpolation, Temporal Generation.

CPU-oriented: FFmpeg, Metadata, Thumbnail, Packaging, Transfer orchestration.

### 3.18 Model / Workflow Registry

ExecutionAdapter:

- ComfyUIAdapter
- DiffusersAdapter
- RemoteWorkerAdapter
- APIAdapter
- FutureAdapter

WorkflowDefinition includes id, name, version, capability, engine, model, inputs, outputs, parameters, requirements, compatibility and workflow artifact/reference.

ModelDefinition includes name, family, version, capability, engine, size, precision, VRAM, location, status and compatibility.

## 4. Page Design Concept

### 4.1 Global Shell

Desktop-first workbench:

```text
┌──────────────┬───────────────────────────────┬──────────────────┐
│ Navigation   │ Main Canvas / Preview         │ Inspector        │
│              │                               │                  │
│ Projects     │                               │ Parameters       │
│ Assets       │                               │ Metadata         │
│ Generate     │                               │ Analysis         │
│ Replication  │                               │ Advanced         │
│ Storyboard   │                               │                  │
│ Jobs         │                               │                  │
│ Results      │                               │                  │
└──────────────┴───────────────────────────────┴──────────────────┘
```

A contextual Timeline or Job Tray may appear at the bottom.

### 4.2 Workspace

Recent Projects, Recent Generations, Active Jobs, Storage Usage, GPU Workers and Quick Actions.

### 4.3 Projects

Project cards plus project-scoped Assets / Generations / Storyboards / Replication Tasks / Results / Settings.

### 4.4 Assets

Grid/List, Search/Filter/Tag/Sort, Preview, Metadata, Analysis, Variants, Lineage and Related Jobs.

### 4.5 Generate

Main Video Preview + Input Slots + Prompt + Generate.

Basic controls: Capability, Model/Auto, Aspect Ratio, Resolution, Duration, FPS, Seed, Quality.

Advanced settings belong in the Inspector.

### 4.6 Replication

Top: Original / Result Preview + A/B Compare.

Middle: Shot Strip, Keyframe Strip, VideoGraph.

Inspector: Camera, Motion, Subject, Scene, Lighting, Style, Timing and Capability Locks.

### 4.7 Keyframe Editor

Current keyframe, neighboring keyframes, timestamp, shot context, reverse prompt, camera/subject state and Temporal Edge.

Actions: Keep, Edit, Regenerate, Replace, Mark as Anchor.

### 4.8 Storyboard

Shot Cards containing Reference, Prompt, Duration, Start Frame, End Frame, Camera, Motion, Status and Generate.

Support Reorder, Duplicate, Batch Generate and Render Sequence.

### 4.9 Jobs

ID, Type, Project, Status, Progress, Stage, Worker, Duration, Retry, Error; support Pause/Resume/Cancel/Retry/Duplicate/Open Result.

### 4.10 Results

Grid Compare, A/B Compare, Favorite, Branch, Reproduce, Copy Parameters, Use as Input, Extend, Interpolate, Upscale, Replicate, Export.

### 4.11 Models / Workflows

Model installation/loading/compatibility; workflow capability, engine, version, model, schema and runtime requirements.

### 4.12 Settings

General, Storage, S3, Workers, GPU, Model Paths, ComfyUI, Diffusers, Transfer, Cache, Proxy, API, Logs, Experimental.

### 4.13 Timeline

P2 feature supporting Reorder, Trim, Split, Transition, Audio, Subtitle, Basic Layers and Export. It is not intended to replace Premiere or DaVinci Resolve.

## 5. Architecture

```text
Web App
  │
API / Control Plane
  │
  ├── Project Service
  ├── Asset Service
  ├── Job Service
  ├── Workflow Registry
  ├── Model Registry
  └── Scheduler
        │
        ▼
Workflow / Job Engine
        │
 ┌──────┼──────────┬──────────┐
 ▼      ▼          ▼          ▼
Gen   Analysis    Media     Transfer
 │      │          │
Comfy  Diffusers  FFmpeg / AI
        │
        ▼
     GPU / CPU Workers

Client  ─────────── S3-compatible Storage
Workers ─────────── S3-compatible Storage

Metadata → PostgreSQL
Queue/Cache → Redis-compatible layer
```

Suggested technology baseline: React + Next.js + TypeScript; FastAPI + Pydantic; PostgreSQL; Redis-compatible coordination; FFmpeg; ComfyUI/Diffusers adapters; S3-compatible object storage; MinIO locally; OpenTelemetry-compatible observability. Introduce Temporal later when durable long-running workflows require it.

## 6. API Concept

Core resources: /projects, /assets, /uploads, /downloads, /jobs, /pipelines, /generations, /replications, /analyses, /keyframes, /models, /workflows, /workers.

Core Specs: GenerationSpec, AnalysisSpec, ReverseSpec, ReplicationSpec, InterpolationSpec, TemporalGenerationSpec, TemporalRepairSpec, UpscaleSpec, CompositionSpec, EncodeSpec, TransferSpec.

## 7. Roadmap

### P0 — Platform Foundation

- Workspace / Projects / Assets
- S3-compatible Storage
- Multipart / Resumable Upload
- Presigned Download
- Asset Metadata / Lineage
- Job / Worker System
- Model / Workflow Registry
- T2V / I2V
- Basic Keyframe Extraction
- Basic Video Analysis
- FFmpeg Pipeline
- Encoding / Thumbnail
- Results / Reproduce / Generation History

P0 reserves contracts for VideoGraph, TemporalEdge, ReplicationSpec, Interpolation, TemporalGeneration, TemporalRepair and Upscale.

### P1 — Understanding and Replication

- Advanced Shot Detection
- Advanced Keyframe Extraction
- Visual Reverse
- Camera / Motion Analysis
- VideoGraph
- Keyframe Editor / Generation
- First/Last Frame Video
- Video Replication
- Capability Locks
- Frame Interpolation
- Temporal Generation / Repair
- Upscale
- Composition
- Batch Generation
- Storyboard
- Live Photo Import/Export

### P2 — Production Workflow

- Timeline
- V2V
- Character Consistency
- Motion Reference
- Automatic Shot Generation
- Audio Generation
- Subtitle
- Advanced Composition
- Multi-GPU Scheduling
- Remote Workers / Cloud GPU
- Collaboration / Quota / Multi-user
- Agent Automation
- Workflow Marketplace / Plugin System

## 8. Non-goals

Early versions should not become a full Premiere/DaVinci replacement, a complex NLE/VFX system, a single-model product, a ComfyUI-bound frontend, an API proxy for every large file, or an over-distributed P0 architecture.

## 9. Success Criteria

P0 succeeds when users can create projects, resumably upload large media, manage Assets, run T2V/I2V, observe Jobs, extract keyframes, inspect basic analysis, transcode outputs, trace lineage and reproduce results.

P1 succeeds when a user can provide a video, automatically decompose it into shots and keyframes, reverse-engineer visual/motion/camera information, choose what to preserve or replace, and generate a structurally and temporally controlled replicated video.
