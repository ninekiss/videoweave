# VideoWeave 项目规划（中文）

版本：v0.1

## 1. 定位

VideoWeave 是一个模型无关、工作流无关、存储可替换、可长期演进的视频生成与视频处理工作台。核心不是单一的 Prompt → Video，而是统一覆盖视频理解、拆解、反推、生成、重建、处理、合成与交付。

核心心智模型：

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

## 2. 核心原则

- Capability-first：用户选择能力，系统再解析模型、工作流和执行器。
- Model-agnostic：业务层不绑定具体模型。
- Workflow-agnostic：ComfyUI 是 Executor 之一，不是产品架构本身。
- Storage-agnostic：统一使用 S3-compatible Storage Adapter。
- Operator-first：生成、分析、提帧、反推、补帧、超分、合成、编码、传输均抽象为 Operator。
- Reproducible：所有结果可追溯、可复现、可分支、可比较。
- Control Plane / Data Plane 分离：大文件不通过 API Server 中转。

## 3. 已知功能域

### 3.1 Workspace / Projects

- Workspace 首页
- Projects 项目管理
- 项目级 Assets、Generations、Storyboards、Replication Tasks、Results、Settings
- Recent Projects / Recent Generations / Active Jobs / Storage Usage / GPU Workers

### 3.2 Assets

支持：

- IMAGE
- VIDEO
- LIVE
- AUDIO
- FRAME_SEQUENCE
- MASK
- SUBTITLE
- ANALYSIS

能力：

- 上传、下载、搜索、过滤、标签、排序
- Grid / List
- Metadata
- Analysis
- Variants
- Lineage
- Related Jobs
- Use as Input
- Analyze
- Extract Frames
- Upscale
- Interpolate
- Replicate
- Convert

### 3.3 Temporal Media

普通视频、Live Photo / Motion Photo、GIF、APNG、Animated WebP、帧序列统一抽象为：

```text
Frames + Timeline + Audio + Metadata
```

Live Asset 保留：

- Primary Still Image
- Motion Segment
- Optional Audio
- Key Timestamp
- Platform Metadata

支持 Live → Still、Live → Video、Video → Live、Extend Motion、Smooth Motion、Regenerate Motion、Upscale Motion、Replicate Motion。

### 3.4 Generation

支持：

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

统一通过 GenerationSpec 表达。

### 3.5 Keyframe

关键帧是一等数据实体，不只是图片。

Keyframe 可包含：

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

提取方式：

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

基础分析：

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

内容分析：

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

结构化反推：

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

输出 ReverseSpec + 可选人类可读 Prompt。

### 3.8 VideoGraph

视频复刻与时序重建的模型无关中间表示。

Node = Keyframe Node。

Edge = Temporal Edge，包含：

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

Video Replication 是一级能力，不等同于普通 V2V。

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

Capability Lock 支持锁定或替换：

- Camera
- Motion
- Composition
- Timing
- Character
- Clothing
- Environment
- Lighting
- Style

支持 Pixel-preserving Reconstruction、Keyframe-guided Reconstruction、Semantic Replication、Structure Transfer、Motion Transfer、Camera Transfer、Style Transfer。

### 3.10 补帧与时序重建

必须区分三类：

1. Frame Interpolation：提高帧密度，尽量保持原内容。
2. Temporal Generation：在关键帧之间生成新的视觉状态。
3. Temporal Repair：修复缺帧、坏帧、跳帧、闪烁、角色漂移、时序断裂。

Interpolation 可通过 RIFE、FILM 等 Adapter 接入。

### 3.11 Upscale

独立 Operator。

支持：

- 720p → 1080p
- 1080p → 2K
- 1080p → 4K
- x2 / x4 / Custom

Adapter 可接 Real-ESRGAN、SwinIR、Video-specific SR、Diffusion Upscale 等。

用户只需看到 Fast / Balanced / Quality。

### 3.12 Composition

视频：concat、trim、split、crop、resize、pad、overlay、transition、speed、reverse。

图片：image sequence → video、overlay、watermark、mask。

音频：merge、replace、mute、music、normalize、voice track。

底层优先 FFmpeg。

### 3.13 Encode / Transcode

容器：MP4、MOV、WebM。

视频编码：H.264、H.265、AV1。

音频：AAC、Opus。

Variants：Original、Preview、Proxy、Delivery、Archive。

### 3.14 S3 与传输

大文件不经过 API Server。

```text
Client ↔ S3-compatible Storage
```

Backend 负责授权、Presigned URL、Multipart 状态、Complete/Abort、Asset Registration。

上传：Multipart、Chunk、Resume、Retry、Parallel Upload、Checksum、Progress、Pause、Cancel。

下载：Presigned Download、Range Request、Resume、CDN、Expiration、Partial Download。

StorageAdapter 可接 MinIO、AWS S3、Cloudflare R2、Backblaze B2、Wasabi 等。

### 3.15 Asset Lineage

每个衍生 Asset 记录 parent_asset_id、operation、job_id、spec_snapshot。

典型 DAG：

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

Job 类型：generation、analysis、frame_extraction、reverse、shot_detection、scene_detection、temporal_generation、interpolation、temporal_repair、upscale、encode、compose、transfer、export。

状态：PENDING、QUEUED、RUNNING、PAUSED、SUCCEEDED、FAILED、CANCELLED。

记录：progress、current_stage、retry_count、priority、worker_id、started_at、finished_at、error、logs、spec_snapshot。

### 3.17 Worker

逻辑角色：Generation Worker、Analysis Worker、Media Worker、Interpolation Worker、Upscale Worker、Transfer Worker。

GPU：Generation、VLM Analysis、Upscale、Interpolation、Temporal Generation。

CPU：FFmpeg、Metadata、Thumbnail、Packaging、Transfer orchestration。

### 3.18 Model / Workflow Registry

ExecutionAdapter：

- ComfyUIAdapter
- DiffusersAdapter
- RemoteWorkerAdapter
- APIAdapter
- FutureAdapter

WorkflowDefinition：id、name、version、capability、engine、model、inputs、outputs、parameters、requirements、compatibility、workflow artifact/reference。

ModelDefinition：name、family、version、capability、engine、size、precision、VRAM、location、status、compatibility。

## 4. 页面设计概念

### 4.1 全局 Shell

桌面优先三栏布局：

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

底部按场景出现 Timeline 或 Job Tray。

### 4.2 Workspace

Recent Projects、Recent Generations、Active Jobs、Storage Usage、GPU Workers、Quick Actions。

### 4.3 Projects

项目卡片 + 项目内部 Assets / Generations / Storyboards / Replication Tasks / Results / Settings。

### 4.4 Assets

Grid/List、Search/Filter/Tag/Sort、Preview、Metadata、Analysis、Variants、Lineage、Related Jobs。

### 4.5 Generate

中央 Video Preview + Input Slots + Prompt + Generate。

基础参数：Capability、Model/Auto、Aspect Ratio、Resolution、Duration、FPS、Seed、Quality。

高级参数进右侧 Inspector。

### 4.6 Replication

顶部 Original / Result Preview + A/B Compare。

中部 Shot Strip、Keyframe Strip、VideoGraph。

右侧 Camera、Motion、Subject、Scene、Lighting、Style、Timing、Capability Locks。

### 4.7 Keyframe Editor

当前关键帧、前后关键帧、Timestamp、Shot Context、Reverse Prompt、Camera/Subject State、Temporal Edge。

操作：Keep、Edit、Regenerate、Replace、Mark as Anchor。

### 4.8 Storyboard

Shot Card 包含 Reference、Prompt、Duration、Start Frame、End Frame、Camera、Motion、Status、Generate。

支持 Reorder、Duplicate、Batch Generate、Render Sequence。

### 4.9 Jobs

ID、Type、Project、Status、Progress、Stage、Worker、Duration、Retry、Error；支持 Pause/Resume/Cancel/Retry/Duplicate/Open Result。

### 4.10 Results

Grid Compare、A/B Compare、Favorite、Branch、Reproduce、Copy Parameters、Use as Input、Extend、Interpolate、Upscale、Replicate、Export。

### 4.11 Models / Workflows

模型安装、加载、兼容性；Workflow 能力、引擎、版本、模型、Schema、运行要求。

### 4.12 Settings

General、Storage、S3、Workers、GPU、Model Paths、ComfyUI、Diffusers、Transfer、Cache、Proxy、API、Logs、Experimental。

### 4.13 Timeline

P2 功能，仅做 Reorder、Trim、Split、Transition、Audio、Subtitle、Basic Layers、Export，不以替代 Premiere/DaVinci 为目标。

## 5. 技术架构

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

建议技术基线：React + Next.js + TypeScript；FastAPI + Pydantic；PostgreSQL；Redis-compatible；FFmpeg；ComfyUI/Diffusers Adapter；S3-compatible Storage；本地 MinIO；OpenTelemetry-compatible。复杂长链路后续按需引入 Temporal。

## 6. API 概念

核心资源：/projects、/assets、/uploads、/downloads、/jobs、/pipelines、/generations、/replications、/analyses、/keyframes、/models、/workflows、/workers。

核心 Spec：GenerationSpec、AnalysisSpec、ReverseSpec、ReplicationSpec、InterpolationSpec、TemporalGenerationSpec、TemporalRepairSpec、UpscaleSpec、CompositionSpec、EncodeSpec、TransferSpec。

## 7. Roadmap

### P0 — 平台骨架

- Workspace / Projects / Assets
- S3-compatible Storage
- Multipart / Resume Upload
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

P0 预留 VideoGraph、TemporalEdge、ReplicationSpec、Interpolation、TemporalGeneration、TemporalRepair、Upscale 契约。

### P1 — 视频理解与复刻

- Advanced Shot Detection
- Advanced Keyframe Extraction
- Visual Reverse
- Camera / Motion Analysis
- VideoGraph
- Keyframe Editor / Generation
- First/Last Frame Video
- Video Replication
- Capability Lock
- Frame Interpolation
- Temporal Generation / Repair
- Upscale
- Composition
- Batch Generation
- Storyboard
- Live Photo Import/Export

### P2 — 生产工作流

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

## 8. 非目标

早期不做完整 Premiere/DaVinci 替代、复杂 NLE/VFX、强绑定单模型、强绑定 ComfyUI、所有大文件走 API 中转、每模型一套业务页面、P0 过度分布式化。

## 9. 成功标准

P0：用户可以创建项目、断点上传大文件、管理 Asset、运行 T2V/I2V、查看 Job、提取关键帧、查看基础分析、转码、追踪 Lineage、复现结果。

P1：用户输入一个视频后，系统可以自动拆镜头、提关键帧、反推视觉/运动/相机信息，允许选择保留或替换要素，并重新生成结构和运动可控的视频。
