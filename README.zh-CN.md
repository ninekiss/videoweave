# VideoWeave

> 一个可扩展的视频生成、理解、复刻、时序重建、处理与交付工作台。

[English README](./README.md)

VideoWeave 采用 Capability-first 架构。模型、ComfyUI Workflow、推理 Runtime、GPU 提供方和对象存储都位于稳定应用契约之后，而不是反过来定义产品架构。

## 当前状态

当前 P0 已经可以从 Web UI 真实跑通两条基础链路：

```text
Project → Browser Multipart Upload → S3/MinIO → Asset → ffprobe
Video Asset → Job → Valkey Queue → Worker → FFmpeg → Keyframe Assets → Lineage
```

## 仓库结构

```text
videoweave/
├── apps/
│   ├── web/                 # Next.js App Router 工作台 UI
│   └── api/                 # FastAPI Control Plane + Worker
├── packages/
│   └── contracts/           # 前后端共享稳定契约
├── docs/
│   ├── architecture/
│   └── plans/
├── AGENTS.md
├── compose.yml              # PostgreSQL 15 / Valkey / MinIO
└── .env.example
```

模块边界见 [项目结构说明](./docs/architecture/PROJECT_STRUCTURE.md)。

## 技术基线

- **Web:** Next.js + React + TypeScript
- **API:** FastAPI + Pydantic + SQLAlchemy
- **数据库迁移:** Alembic
- **Job Queue:** Valkey / Redis-compatible
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

如果 API 不是默认的 `http://localhost:8000`，把 `apps/web/.env.example` 复制成 `apps/web/.env.local`，并修改 `NEXT_PUBLIC_API_URL`。

### 2. 启动本地基础设施

```bash
docker compose up -d
```

会启动 PostgreSQL 15、Valkey、MinIO 和 MinIO Console。MinIO 浏览器 CORS 在本地 Compose 层配置，不属于上传事务本身。

### 3. 初始化并启动 API

```bash
cd apps/api
uv sync --dev
uv run alembic upgrade head
uv run uvicorn videoweave_api.main:app --reload --port 8000
```

`uv sync` 会根据 `pyproject.toml` 更新 Python lockfile，包括 Job Queue 使用的 `redis` 客户端。

健康检查：`GET http://localhost:8000/health`

### 4. 启动 Worker

再打开一个终端：

```bash
cd apps/api
uv run python -m videoweave_api.worker
```

Worker 会从 Valkey 的 `videoweave:jobs` 队列取任务。PostgreSQL 才是 Job 状态与历史记录的 source of truth。

### 5. 启动 Web

仓库根目录：

```bash
pnpm install
pnpm dev:web
```

访问 `http://localhost:3000/projects`。

## 当前可验证流程

### Browser Upload

```text
Create Project
→ 选择 / 拖入视频
→ 初始化 Multipart Upload
→ Browser 直接 PUT 分片到 S3 / MinIO
→ 恢复缺失分片
→ Complete Upload
→ ffprobe
→ Asset Preview + Inspector
```

### Keyframe Extraction

选中一个 `READY` 的 Video Asset，然后在右侧 Inspector 点击 **Extract 8 keyframes**：

```text
Video Asset
→ POST keyframe Job
→ QUEUED
→ Valkey
→ Worker
→ 下载源视频到临时目录
→ FFmpeg 均匀提取 8 帧
→ JPEG 直接上传 S3 / MinIO
→ 创建 IMAGE Assets
→ 创建 AssetLineage
→ Job SUCCEEDED
→ Web 自动刷新 Assets
```

第一版刻意只实现 `uniform + count=8` 的最小能力。Scene/Shot/内容变化/代表帧等高级策略后续作为同一个 Keyframe Extraction Capability 的新模式扩展。

## 当前 P0 API

```text
GET    /health
GET    /v1/capabilities

POST   /v1/projects
GET    /v1/projects
GET    /v1/projects/{project_id}
GET    /v1/projects/{project_id}/assets
GET    /v1/assets/{asset_id}
GET    /v1/assets/{asset_id}/access

POST   /v1/projects/{project_id}/uploads
POST   /v1/uploads/{upload_session_id}/parts/{part_number}
GET    /v1/uploads/{upload_session_id}
POST   /v1/uploads/{upload_session_id}/complete
DELETE /v1/uploads/{upload_session_id}

POST   /v1/assets/{asset_id}/keyframes
GET    /v1/jobs
GET    /v1/jobs/{job_id}
```

## 快速验证阶段的测试策略

当前阶段测试刻意保持精简：优先保护真正的产品主链路，不为尚未出现的理论边界追求覆盖率。

目前核心测试包括：

- API Health smoke test
- ffprobe 元数据解析
- uniform keyframe timestamp 计算

数据库/S3/浏览器/Queue 的集成测试会在真实使用暴露出值得保护的故障点时再增加。

## 开发原则

1. Capability-first，而不是 Model-first。
2. 应用层不能直接依赖 ComfyUI Graph 或模型私有 Payload。
3. 大媒体文件直接在 Client/Worker 与 S3-compatible Storage 之间传输。
4. PostgreSQL 保存 Job 的持久状态；Queue 只负责调度。
5. 所有衍生 Asset 保存 Lineage 与可复现信息。
6. 普通补帧、生成式补帧、时序修复保持为三个独立 Operator。
7. 优先增量升级；破坏性变更必须提供明确迁移方案。
8. 快速验证阶段优先测试核心路径，而不是追求理论覆盖率。

## Roadmap

- **P0:** Asset Pipeline、Job/Worker、关键帧提取、基础分析、T2V/I2V 和可复现结果。
- **P1:** 视频理解、VideoGraph、视觉反推、视频复刻、时序处理、超分和 Storyboard。
- **P2:** Timeline、高级 V2V、一致性系统、多 GPU/Remote Worker、协作、自动化和插件生态。

## License

待确定。
