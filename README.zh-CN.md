# VideoWeave

> 一个可扩展的视频生成、理解、复刻、时序重建、处理与交付工作台。

[English README](./README.md)

VideoWeave 采用 Capability-first 架构。模型、ComfyUI Workflow、推理 Runtime、GPU 提供方和对象存储都位于稳定应用契约之后，而不是反过来定义产品架构。

## 当前状态

仓库已经初始化为可开发的 monorepo。当前第一条 P0 Vertical Slice 已覆盖 Project、Asset、S3-compatible Multipart 上传/续传基础、媒体注册和 ffprobe 元数据提取。

## 仓库结构

```text
videoweave/
├── apps/
│   ├── web/                 # Next.js App Router 工作台 UI
│   └── api/                 # FastAPI Control Plane
├── packages/
│   └── contracts/           # 前后端共享稳定契约
├── docs/
│   ├── architecture/
│   └── plans/
├── AGENTS.md
├── compose.yml              # PostgreSQL / Valkey / MinIO
└── .env.example
```

模块边界见 [项目结构说明](./docs/architecture/PROJECT_STRUCTURE.md)。

## 技术基线

- **Web:** Next.js + React + TypeScript
- **API:** FastAPI + Pydantic + SQLAlchemy
- **数据库迁移:** Alembic
- **本地基础设施:** PostgreSQL + Valkey + MinIO
- **媒体处理:** FFmpeg / ffprobe
- **存储:** S3-compatible Multipart Transfer
- **推理 Adapter:** ComfyUI、Diffusers、Remote Worker、外部 API
- **包管理:** TypeScript 使用 pnpm，Python 使用 uv

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 11+
- Python 3.12+
- uv
- Docker + Compose
- `PATH` 中可用 FFmpeg / ffprobe

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

### 3. 初始化并启动 API

```bash
cd apps/api
uv sync --dev
uv run alembic upgrade head
uv run uvicorn videoweave_api.main:app --reload --port 8000
```

健康检查：`GET http://localhost:8000/health`

### 4. 启动 Web

仓库根目录：

```bash
pnpm install
pnpm dev:web
```

访问 `http://localhost:3000`。

## 当前 P0 API

```text
GET    /health
GET    /v1/capabilities

POST   /v1/projects
GET    /v1/projects
GET    /v1/projects/{project_id}
GET    /v1/projects/{project_id}/assets
GET    /v1/assets/{asset_id}

POST   /v1/projects/{project_id}/uploads
POST   /v1/uploads/{upload_session_id}/parts/{part_number}
GET    /v1/uploads/{upload_session_id}
POST   /v1/uploads/{upload_session_id}/complete
DELETE /v1/uploads/{upload_session_id}
```

上传采用 Client 直传 S3 的方式。API 只负责创建和跟踪 Multipart Session，不中转大文件；上传完成后执行 best-effort ffprobe 元数据提取。

## 快速验证阶段的测试策略

当前阶段测试刻意保持精简：优先保护真正的产品主链路，不为尚未出现的理论边界追求覆盖率。

目前核心测试主要包括：

- API Health smoke test
- ffprobe 元数据解析

数据库/S3 的集成测试会在真实使用暴露出值得保护的故障点时再增加。

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
7. 快速验证阶段优先测试核心路径，而不是追求理论覆盖率。

## Roadmap

- **P0:** 平台骨架、Asset Pipeline、Job/Worker、关键帧提取、基础分析和可复现生成。
- **P1:** 视频理解、VideoGraph、视觉反推、视频复刻、时序处理、超分和 Storyboard。
- **P2:** Timeline、高级 V2V、一致性系统、多 GPU/Remote Worker、协作、自动化和插件生态。

## License

待确定。
