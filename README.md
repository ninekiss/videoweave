# VideoWeave

> An extensible workbench for video generation, understanding, replication, temporal reconstruction, processing, and delivery.

[中文 README](./README.zh-CN.md)

VideoWeave is a capability-first video AI workbench. Models, ComfyUI workflows, inference runtimes, GPU providers, and object-storage vendors sit behind stable application contracts instead of defining the product architecture.

## Status

The repository is now initialized as a development monorepo. The first milestone is the P0 platform foundation: projects, assets, S3-compatible storage, resumable transfers, jobs/workers, generation adapters, keyframe extraction, basic analysis, and reproducible results.

## Repository layout

```text
videoweave/
├── apps/
│   ├── web/                 # Next.js workbench UI
│   └── api/                 # FastAPI control plane
├── packages/
│   └── contracts/           # Stable client/domain contracts
├── docs/
│   ├── architecture/        # Architecture and repository structure
│   └── plans/               # Product plans (EN / zh-CN)
├── AGENTS.md                # Coding-agent rules and compatibility policy
├── compose.yml              # Local PostgreSQL / Valkey / MinIO
└── .env.example
```

See [Project Structure](./docs/architecture/PROJECT_STRUCTURE.md) for module boundaries.

## Core mental model

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

## Technology baseline

- **Web:** Next.js + React + TypeScript
- **API / Control Plane:** FastAPI + Pydantic
- **Local infrastructure:** PostgreSQL + Valkey + MinIO
- **Media:** FFmpeg
- **Inference adapters:** ComfyUI, Diffusers, remote workers, external APIs
- **Storage contract:** S3-compatible object storage
- **Package management:** pnpm for TypeScript, uv for Python

Infrastructure choices are replaceable. Domain contracts must remain stable.

## Quick start

### Requirements

- Node.js 22+
- pnpm 11+
- Python 3.12+
- uv
- Docker with Compose

### 1. Configure environment

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Start local infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL, Valkey, MinIO, and the MinIO console.

### 3. Start the API

```bash
cd apps/api
uv sync --dev
uv run uvicorn videoweave_api.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health`

### 4. Start the web app

From the repository root:

```bash
pnpm install
pnpm dev:web
```

Open `http://localhost:3000`.

## Initial API surface

The scaffold intentionally starts small:

- `GET /health`
- `GET /v1/capabilities`

Long-running generation and media operations will be asynchronous Jobs rather than long-held HTTP requests.

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

## Roadmap

- **P0:** platform foundation and reproducible generation pipeline.
- **P1:** video understanding, VideoGraph, keyframe reverse engineering, video replication, interpolation/temporal generation/repair, upscale, storyboard.
- **P2:** timeline, advanced V2V, consistency systems, multi-GPU/remote workers, collaboration, automation and plugin ecosystem.

See the full plans in `docs/plans/`.

## License

To be determined.
