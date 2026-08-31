# VideoWeave

> 一个可扩展的视频生成、理解、复刻、时序重建、处理与交付工作台。

[English README](./README.md)

## 项目简介

VideoWeave 是一个模型无关、工作流无关的视频 AI 工作台。它不围绕某一个视频模型或某一个 ComfyUI Workflow 构建产品，而是在快速变化的模型、推理框架、GPU Runtime 和存储系统之上建立长期稳定的能力层。

核心能力包括：

- 文本生成视频
- 图片生成视频
- 首帧 / 尾帧生成视频
- 关键帧生成视频
- 视频生成视频
- 视频分析
- 镜头检测
- 关键帧提取
- 视觉反推
- 视频复刻
- 普通补帧
- 生成式补帧
- 时序修复
- 视频超分
- 合成
- 转码
- 断点续传
- S3-compatible 存储
- Live Photo / Temporal Media 处理

## 核心心智模型

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

模型、工作流、推理框架、GPU 和存储都属于可以替换的基础设施。

## 核心原则

### Capability-first

用户首先选择“要做什么”，系统再决定“用什么做”。

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

领域层不能直接依赖某一个视频模型。

### Workflow-agnostic

支持 ComfyUI，但产品不能变成 ComfyUI 前端。

### Storage-agnostic

大文件统一通过 S3-compatible Object Storage 管理，可接 MinIO、AWS S3、Cloudflare R2、Backblaze B2、Wasabi 等。

### 可复现

每个生成和处理结果都应记录输入、Prompt、Seed、模型及版本、Workflow 及版本、Adapter / LoRA、Runtime 参数、分辨率、FPS、时长、Worker、输出 Asset 和 Asset Lineage。

## 主要产品区域

### Generate

支持从文本、图片、首尾帧、关键帧、参考素材和视频生成视频。

### Analyze

分析媒体信息、场景、镜头、人物、相机运动、运动状态、OCR、质量和视觉结构。

### Keyframes

提取、分析、编辑、重新生成关键帧，并将其作为视频时序锚点。

### Replication

将原视频反推为可编辑的视觉、相机、运动、节奏和关键帧结构，再选择保留或替换部分属性重新生成视频。

### Temporal Processing

VideoWeave 明确区分：

- **Frame Interpolation**：普通补帧，提高帧密度。
- **Temporal Generation**：在关键帧之间生成新的时序内容。
- **Temporal Repair**：修复缺帧、坏帧、闪烁和时序不连续。

### Upscale

通过可替换 Adapter 进行视频超分。

### Compose

使用统一媒体处理管线完成裁剪、拼接、转场、叠加、音频、字幕和最终交付。

### Temporal Media

普通视频、Live Photo / Motion Photo、GIF、APNG、Animated WebP 和帧序列统一进入 Temporal Media 模型。

## 视频复刻

Video Replication 是一级能力。

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

可以选择保留或替换 Camera、Motion、Composition、Timing、Character、Clothing、Environment、Lighting、Style。

例如：保留原视频的镜头、动作、构图和节奏，但替换人物和环境。

## VideoGraph

VideoGraph 是视频复刻与时序重建的模型无关中间表示。

```text
Keyframe Node
    │
Temporal Edge
    │
Keyframe Node
```

Keyframe Node 保存某个时刻的视觉状态；Temporal Edge 保存 duration、camera motion、subject motion、pose transition、object motion、lighting transition、timing 和 constraints。

## 架构

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

Metadata    → PostgreSQL
Queue/Cache → Redis-compatible layer
```

## 建议技术基线

Frontend：React、Next.js、TypeScript。

Backend：FastAPI、Pydantic。

Persistence：PostgreSQL。

Coordination：Redis-compatible layer。

Media：FFmpeg。

Generation / Inference：ComfyUI Adapter、Diffusers Adapter、Remote Worker Adapter、API Adapter。

Storage：S3-compatible Object Storage，本地开发默认 MinIO。

Observability：OpenTelemetry-compatible。

后续在复杂长链路需要可靠恢复时，可引入 Temporal。

## 主要页面

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

桌面端采用左侧导航 + 中央主画布/预览 + 右侧 Inspector，并根据场景在底部出现 Timeline 或 Job Tray。

## Roadmap

### P0 — 平台骨架

- Workspace / Projects / Assets
- S3-compatible Storage
- Multipart / 断点续传
- Presigned Download
- Asset Metadata / Lineage
- Job / Worker System
- Model / Workflow Registry
- T2V / I2V
- 基础关键帧提取
- 基础视频分析
- FFmpeg Pipeline
- 编码 / 转码 / Thumbnail
- Results / Generation History / Reproduce

P0 同时预留 VideoGraph、TemporalEdge、ReplicationSpec、Interpolation、TemporalGeneration、TemporalRepair、Upscale 的稳定接口。

### P1 — 视频理解与复刻

- 高级镜头检测与关键帧提取
- 视觉反推 / 相机分析 / 运动分析
- VideoGraph
- Keyframe Editor / Generation
- 首尾帧生成视频
- Video Replication / Capability Lock
- Frame Interpolation
- Temporal Generation / Repair
- Video Upscale
- Composition
- Batch Generation
- Storyboard
- Live Photo 导入 / 导出

### P2 — 生产工作流

- Timeline
- V2V
- Character Consistency
- Motion Reference
- Automatic Shot Generation
- Audio Generation / Subtitle
- Advanced Composition
- Multi-GPU / Remote Workers / Cloud GPU
- Collaboration / Quota / Multi-user
- Agent Automation
- Plugin / Workflow Marketplace

## 文档

- [English README](./README.md)
- [中文项目规划](./VIDEO_GEN_PLAN.zh-CN.md)
- [English Project Plan](./VIDEO_GEN_PLAN.en.md)
- [Agent 开发说明](./AGENTS.md)

## 非目标

VideoWeave 早期不会尝试成为 Premiere 或 DaVinci Resolve 的完整替代品，也不会成为 ComfyUI 前端克隆、某一个模型的薄 UI 或厂商绑定的云产品。

长期价值来自稳定的 Capability Layer、可复现 Media Graph 和视频生产工作流。

## 项目状态

目前处于产品与架构规划阶段。首要目标是建立可复用的平台骨架，再扩展视频复刻和更完整的生产工作流。

## License

待确定。
