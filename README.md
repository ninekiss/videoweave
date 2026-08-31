# VideoWeave

> An extensible workbench for video generation, understanding, replication, temporal reconstruction, processing, and delivery.

[中文 README](./README.zh-CN.md)

VideoWeave is a capability-first video AI workbench. Models, ComfyUI workflows, inference runtimes, GPU providers, and object-storage vendors sit behind stable application contracts instead of defining the product architecture.

## Status

The current P0 vertical slice is usable from the web UI: create Projects, upload video directly from the browser to S3-compatible storage with multipart/resume primitives, register Assets, preview completed media, and inspect ffprobe metadata.

## Repository layout

```text
videoweave/
├── apps/
│   ├── web/                 # Next.js App Router workbench UI
│   └── api/                 # FastAPI control plane
├── packages/
│   └── contracts/           # Shared stable client/domain contracts
├── docs/
│   ├── architecture/
│   └── plans/
├── AGENTS.md
├── compose.yml              # PostgreSQL / Valkey / MinIO
└── .env.example
```

See [Project Structure](./docs/architecture/PROJECT_STRUCTURE.md) for module boundaries.

## Technology baseline

- **Web:** Next.js + React + TypeScript
- **API:** FastAPI + Pydantic + SQLAlchemy
- **Database migrations:** Alembic
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

This starts PostgreSQL, Valkey, MinIO, and the MinIO console. If PostgreSQL or MinIO are already managed elsewhere, point `.env` at those instances instead.

### 3. Prepare and start the API

```bash
cd apps/api
uv sync --dev
uv run alembic upgrade head
uv run uvicorn videoweave_api.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health`

### 4. Start the web app

From the repository root:

```bash
pnpm install
pnpm dev:web
```

Open `http://localhost:3000`, then go to **Projects**.

## Browser upload flow

The Projects page now provides the real P0 asset workflow:

```text
Create Project
→ Choose / drop video
→ Initialize multipart upload
→ Browser PUTs parts directly to S3 / MinIO
→ Resume missing parts when the same file is selected again
→ Complete upload
→ ffprobe metadata extraction
→ Asset preview + Inspector
```

The browser never receives S3 credentials. It only receives short-lived presigned URLs. Local development can let VideoWeave manage bucket CORS with `S3_MANAGE_BUCKET_CORS=true`; disable this when bucket CORS is managed externally.

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
```

## Testing policy during rapid validation

Testing is intentionally lean at this stage. Keep tests that protect the primary product path, and avoid spending time on exhaustive edge-case coverage before those cases appear in real usage.

Current core tests focus on:

- API health smoke test
- ffprobe metadata parsing

Database/S3/browser integration coverage will be added only where failures begin to matter to real workflows.

## Documentation

- [Project Plan — English](./docs/plans/VIDEO_GEN_PLAN.en.md)
- [项目规划 — 中文](./docs/plans/VIDEO_GEN_PLAN.zh-CN.md)
- [Architecture / Project Structure](./docs/architecture/PROJECT_STRUCTURE.md)
- [Agent Development Rules](./AGENTS.md)

## Development principles

1. Capability-first, not model-first.
2. Do not couple application code directly to ComfyUI graphs or model-specific payloads.
3. Large media goes directly between clients/workers and S3-compatible storage.
4. Every derived asset must preserve lineage and reproducibility metadata.
5. Frame interpolation, temporal generation, and temporal repair remain separate operators.
6. Prefer additive upgrades; breaking migrations require an explicit migration path.
7. During rapid validation, test the core path rather than chasing theoretical coverage.

## Roadmap

- **P0:** platform foundation, asset pipeline, jobs/workers, keyframe extraction, basic analysis and reproducible generation.
- **P1:** video understanding, VideoGraph, reverse engineering, replication, temporal processing, upscale and storyboard.
- **P2:** timeline, advanced V2V, consistency systems, multi-GPU/remote workers, collaboration, automation and plugin ecosystem.

## License

To be determined.
