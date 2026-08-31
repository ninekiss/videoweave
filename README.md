# VideoWeave

> An extensible workbench for video generation, understanding, replication, temporal reconstruction, processing, and delivery.

[中文 README](./README.zh-CN.md)

## Overview

VideoWeave is a model-agnostic and workflow-agnostic video AI workbench.

It is designed to provide a stable product and capability layer above rapidly changing video models, inference engines, workflow systems, GPU runtimes, and storage providers.

Instead of building the product around a specific model or ComfyUI workflow, VideoWeave organizes the system around durable capabilities such as:

- Text-to-Video
- Image-to-Video
- First/Last Frame-to-Video
- Keyframe-to-Video
- Video-to-Video
- Video Analysis
- Shot Detection
- Keyframe Extraction
- Visual Reverse Engineering
- Video Replication
- Frame Interpolation
- Temporal Generation
- Temporal Repair
- Video Upscaling
- Composition
- Transcoding
- Resumable Transfer
- S3-compatible Storage
- Live Photo / Temporal Media processing

## Product Mental Model

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

Models, workflows, inference runtimes, GPU providers, and storage systems are implementation details behind stable capability contracts.

## Core Principles

### Capability-first

Users select what they want to do before selecting how it should be executed.

```text
Capability
→ Spec
→ Resolver
→ Adapter
→ Executor
→ Job
→ Output Assets
```

### Model-agnostic

The domain layer must not depend directly on a specific video model.

### Workflow-agnostic

ComfyUI is supported as an execution backend, but the application must not become a ComfyUI frontend.

### Storage-agnostic

Large media is stored through an S3-compatible storage layer.

Potential backends include:

- MinIO
- AWS S3
- Cloudflare R2
- Backblaze B2
- Wasabi
- other S3-compatible providers

### Reproducible

Every generated or processed result should preserve the information required to reproduce it:

- inputs
- prompts
- seeds
- model and version
- workflow and version
- adapters / LoRAs
- runtime parameters
- resolution
- FPS
- duration
- worker
- output assets
- lineage

## Major Product Areas

### Generate

Generate video from text, images, reference frames, first/last frames, keyframes, or existing video.

### Analyze

Analyze media metadata, scenes, shots, subjects, camera movement, motion, quality, OCR, and visual structure.

### Keyframes

Extract, analyze, edit, regenerate, and use keyframes as temporal anchors.

### Replication

Reverse-engineer an existing video into editable visual, camera, motion, timing, and keyframe structures, then reconstruct a new video while selectively preserving or replacing properties.

### Temporal Processing

VideoWeave keeps three different temporal operations separate:

- **Frame Interpolation** — increase frame density while preserving the source motion.
- **Temporal Generation** — generate new intermediate visual states between anchors.
- **Temporal Repair** — reconstruct missing, broken, flickering, or temporally inconsistent sections.

### Upscale

Run video super-resolution through replaceable adapters.

### Compose

Use a media pipeline for trimming, concatenation, transitions, overlays, audio, subtitles, and final delivery.

### Temporal Media

Video, Live Photo / Motion Photo, GIF, APNG, animated WebP, and frame sequences are normalized into a common temporal media model.

## Video Replication

Video Replication is a first-class capability.

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
→ Keep / Edit / Regenerate Keyframes
→ Temporal Generation
→ Frame Interpolation
→ Temporal Repair
→ Composition
→ Upscale
→ Encode
→ Delivery
```

Replication can selectively preserve:

- Camera
- Motion
- Composition
- Timing
- Character
- Clothing
- Environment
- Lighting
- Style

This allows workflows such as:

> Keep the original camera, motion, composition, and timing while replacing the character and environment.

## VideoGraph

VideoGraph is the model-independent intermediate representation used for replication and temporal reconstruction.

```text
Keyframe Node
    │
Temporal Edge
    │
Keyframe Node
```

A Keyframe Node stores visual state.

A Temporal Edge may store:

- duration
- camera motion
- subject motion
- pose transition
- object motion
- lighting transition
- timing
- transition type
- constraints

## Architecture

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

Metadata   → PostgreSQL
Queue/Cache → Redis-compatible layer
```

## Suggested Technology Baseline

### Frontend

- React
- Next.js
- TypeScript

### Backend

- FastAPI
- Pydantic

### Persistence

- PostgreSQL

### Coordination

- Redis-compatible layer

### Media

- FFmpeg

### Generation / Inference

- ComfyUI Adapter
- Diffusers Adapter
- Remote Worker Adapter
- API Adapter

### Storage

- S3-compatible Object Storage
- MinIO for local development

### Observability

- OpenTelemetry-compatible instrumentation

### Optional Later

A durable workflow engine such as Temporal can be introduced when long-running cross-service workflows require stronger recovery guarantees.

## Main Pages

```text
Workspace
Projects
Assets
Generate
Replication
Storyboard
Jobs
Results
Models
Workflows
Settings
```

The desktop UI follows a workbench layout:

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

## Roadmap

### P0 — Platform Foundation

- Workspace
- Projects
- Assets
- S3-compatible storage
- Multipart and resumable upload
- Presigned download
- Asset metadata
- Asset lineage
- Job system
- Worker system
- Model Registry
- Workflow Registry
- Text-to-Video
- Image-to-Video
- Basic keyframe extraction
- Basic video analysis
- FFmpeg media pipeline
- Encoding / transcoding
- Thumbnails
- Results
- Generation history
- Reproduce

P0 also defines forward-compatible contracts for:

- VideoGraph
- TemporalEdge
- ReplicationSpec
- Interpolation
- TemporalGeneration
- TemporalRepair
- Upscale

### P1 — Understanding and Replication

- Advanced shot detection
- Advanced keyframe extraction
- Visual reverse engineering
- Camera analysis
- Motion analysis
- VideoGraph
- Keyframe Editor
- Keyframe generation
- First/Last Frame video generation
- Video Replication
- Capability Locks
- Frame Interpolation
- Temporal Generation
- Temporal Repair
- Video Upscale
- Composition
- Batch Generation
- Storyboard
- Live Photo import/export

### P2 — Production Workflow

- Timeline
- Video-to-Video
- Character consistency
- Motion reference
- Automatic shot generation
- Audio generation
- Subtitle workflows
- Advanced composition
- Multi-GPU scheduling
- Remote workers
- Cloud GPU
- Collaboration
- Quotas
- Multi-user
- Agent automation
- Plugin / Workflow marketplace

## Repository Documentation

- [中文 README](./README.zh-CN.md)
- [Chinese Project Plan](./VIDEO_GEN_PLAN.zh-CN.md)
- [English Project Plan](./VIDEO_GEN_PLAN.en.md)
- [Agent Development Guide](./AGENTS.md)

## Non-goals

VideoWeave is not intended to become:

- a full Premiere replacement
- a full DaVinci Resolve replacement
- a ComfyUI frontend clone
- a thin UI around one model
- a vendor-specific cloud application

Its durable value is the capability layer, reproducible media graph, and production workflow.

## Project Status

Early architecture and product planning.

The initial goal is to establish a reusable platform foundation before expanding into advanced replication and production workflows.

## License

License to be determined.
