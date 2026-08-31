# VideoWeave

> 一个可扩展的视频生成、理解、复刻、时序重建、处理与交付工作台。

[English README](./README.md)

VideoWeave 采用 Capability-first 架构。模型、ComfyUI Workflow、推理 Runtime、GPU 提供方和对象存储都位于稳定应用契约之后，而不是反过来定义产品架构。

## 当前状态

仓库已经初始化为可开发的 monorepo。第一阶段是 P0 平台骨架：Project、Asset、S3-compatible Storage、断点续传、Job/Worker、生成 Adapter、关键帧提取、基础视频分析，以及可复现的生成结果。

## 仓库结构

```text
videoweave/
├── apps/
│   ├── web/                 # Next.js 工作台 UI
│   └── api/                 # FastAPI Control Plane
├── packages/
│   └── contracts/           # 稳定的客户端/领域契约
├── docs/
│   ├── architecture/        # 架构与目录说明
│   └── plans/               # 中英文产品规划
├── AGENTS.md                # Agent 开发约束与兼容性策略
├── compose.yml              # 本地 PostgreSQL / Valkey / MinIO
└── .env.example
```

模块边界见 [项目结构说明](./docs/architecture/PROJECT_STRUCTURE.md)。

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

## 技术基线

- **Web:** Next.js + React + TypeScript
- **API / Control Plane:** FastAPI + Pydantic
- **本地基础设施:** PostgreSQL + Valkey + MinIO
- **媒体处理:** FFmpeg
- **推理 Adapter:** ComfyUI、Diffusers、Remote Worker、外部 API
- **存储契约:** S3-compatible Object Storage
- **包管理:** TypeScript 使用 pnpm，Python 使用 uv

基础设施可以替换，领域契约保持稳定。

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 11+
- Python 3.12+
- uv
- Docker + Compose

### 1. 创建环境文件

PowerShell：

```powershell
Copy-Item .env.example .env
```

### 2. 启动本地基础设施

```bash
docker compose up -d
```

会启动 PostgreSQL、Valkey、MinIO 和 MinIO Console。

### 3. 启动 API

```bash
cd apps/api
uv sync --dev
uv run uvicorn videoweave_api.main:app --reload --port 8000
```

健康检查：`GET http://localhost:8000/health`

### 4. 启动 Web

仓库根目录执行：

```bash
pnpm install
pnpm dev:web
```

访问 `http://localhost:3000`。

## 当前 API 骨架

目前只保留最小入口：

- `GET /health`
- `GET /v1/capabilities`

视频生成和媒体处理等长任务后续统一通过异步 Job，不让 HTTP 请求长期阻塞。

## 文档

- [中文项目规划](./docs/plans/VIDEO_GEN_PLAN.zh-CN.md)
- [English Project Plan](./docs/plans/VIDEO_GEN_PLAN.en.md)
- [架构 / 项目目录](./docs/architecture/PROJECT_STRUCTURE.md)
- [Agent 开发约束](./AGENTS.md)

## 开发原则

1. Capability-first，而不是 Model-first。
2. 应用层不能直接依赖 ComfyUI Graph 或模型私有 Payload。
3. 大媒体文件直接在 Client/Worker 与 S3-compatible Storage 之间传输。
4. 所有衍生 Asset 保存 Lineage 与可复现信息。
5. 普通补帧、生成式补帧、时序修复保持为三个独立 Operator。
6. 优先增量升级；破坏性变更必须提供明确迁移方案。

## Roadmap

- **P0:** 平台骨架和可复现生成管线。
- **P1:** 视频理解、VideoGraph、关键帧反推、视频复刻、补帧/时序生成/修复、超分、Storyboard。
- **P2:** Timeline、高级 V2V、一致性系统、多 GPU/Remote Worker、协作、自动化和插件生态。

完整规划见 `docs/plans/`。

## License

待确定。
