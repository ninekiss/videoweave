# VideoWeave

> An extensible workbench for video generation, understanding, replication, temporal reconstruction, processing, and delivery.

[中文 README](./README.zh-CN.md)

VideoWeave is a capability-first video AI workbench. Models, ComfyUI workflows, inference runtimes, GPU providers, and object-storage vendors sit behind stable application contracts instead of defining the product architecture.

## Status

P0 now has two real end-to-end foundations:

```text
Project → Browser Multipart Upload → S3/MinIO → Asset → ffprobe
Video Asset → Job → Valkey Queue → Worker → FFmpeg → Keyframe Assets → Lineage
```

## Repository layout

```text
videoweave/
├── apps/
│   ├── web/                 # Next.js App Router workbench UI
│   └── api/                 # FastAPI control plane + Worker
├── packages/
│   └── contracts/           # Shared stable client/domain contracts
├── docs/
│   ├── architecture/
│   └── plans/
├── AGENTS.md
├── compose.yml              # PostgreSQL 15 / Valkey / MinIO
└── .env.example
```

See [Project Structure](./docs/architecture/PROJECT_STRUCTURE.md) for module boundaries.

## Technology baseline

- **Web:** Next.js + React + TypeScript
- **API:** FastAPI + Pydantic + SQLAlchemy
- **Database migrations:** Alembic
- **Job queue:** Valkey / Redis-compatible
- **Local infrastructure:** PostgreSQL + Valkey + MinIO
- **Media:** FFmpeg / ffprobe
- **Storage:** S3-compatible multipart transfer
- **Inference adapters:** ComfyUI, Diffusers, remote workers, external APIs
- **Package management:** pnpm for TypeScript, uv for Python

## Quick start

### Requirements

- Node.js 22+
- pnpm 11+
- Python 3.12+
- uv
- Docker with Compose
- FFmpeg / ffprobe available on `PATH`

### 1. Configure environment

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

For a non-default API address, copy `apps/web/.env.example` to `apps/web/.env.local` and change `NEXT_PUBLIC_API_URL`.

### 2. Start local infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL 15, Valkey, MinIO, and the MinIO console. Local MinIO browser CORS is configured at the Compose/deployment layer, not inside upload transactions.

### 3. Prepare and start the API

```bash
cd apps/api
uv sync --dev
uv run alembic upgrade head
uv run uvicorn videoweave_api.main:app --reload --port 8000
```

`uv sync` updates the Python lockfile for the new Redis-compatible queue client.

Health check: `GET http://localhost:8000/health`

### 4. Start the Worker

In another terminal:

```bash
cd apps/api
uv run python -m videoweave_api.worker
```

PostgreSQL remains the source of truth for Job state/history. Valkey only carries queued Job IDs.

### 5. Start the web app

From the repository root:

```bash
pnpm install
pnpm dev:web
```

Open `http://localhost:3000/projects`.

## Browser upload flow

```text
Create Project
→ Choose / drop video
→ Initialize multipart upload
→ Browser PUTs parts directly to S3 / MinIO
→ Resume missing parts
→ Complete upload
→ ffprobe metadata extraction
→ Asset preview + Inspector
```

## Keyframe extraction flow

Select a READY Video Asset and click **Extract 8 keyframes** in the Asset Inspector:

```text
Video Asset
→ Create keyframe Job
→ QUEUED
→ Valkey
→ Worker
→ Download source video to temporary storage
→ FFmpeg extracts 8 uniform frames
→ JPEGs upload directly to S3 / MinIO
→ IMAGE Assets + AssetLineage
→ Job SUCCEEDED
→ Web refreshes Assets
```

The first implementation intentionally supports only `uniform + count=8`. Scene/shot/content-change/representative-frame modes will extend the same capability later.

## Current P0 API

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

## Testing policy during rapid validation

Testing is intentionally lean. Current core tests cover:

- API health smoke test
- ffprobe metadata parsing
- uniform keyframe timestamp calculation

Database/S3/browser/queue integration tests will be added only when real failures justify protecting those paths.

## Documentation

- [Project Plan — English](./docs/plans/VIDEO_GEN_PLAN.en.md)
- [项目规划 — 中文](./docs/plans/VIDEO_GEN_PLAN.zh-CN.md)
- [Architecture / Project Structure](./docs/architecture/PROJECT_STRUCTURE.md)
- [Agent Development Rules](./AGENTS.md)

## Development principles

1. Capability-first, not model-first.
2. Do not couple application code directly to ComfyUI graphs or model-specific payloads.
3. Large media goes directly between clients/workers and S3-compatible storage.
4. PostgreSQL stores durable Job state; the queue only schedules work.
5. Every derived Asset preserves lineage and reproducibility metadata.
6. Frame interpolation, temporal generation, and temporal repair remain separate operators.
7. Prefer additive upgrades; breaking migrations require an explicit migration path.
8. During rapid validation, test the core path rather than chasing theoretical coverage.

## Roadmap

- **P0:** asset pipeline, jobs/workers, keyframe extraction, basic analysis, T2V/I2V and reproducible results.
- **P1:** video understanding, VideoGraph, reverse engineering, replication, temporal processing, upscale and storyboard.
- **P2:** timeline, advanced V2V, consistency systems, multi-GPU/remote workers, collaboration, automation and plugin ecosystem.

## License

To be determined.
