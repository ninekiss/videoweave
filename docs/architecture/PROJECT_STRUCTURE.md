# Project Structure

## Goal

Keep stable product/domain contracts independent from fast-moving models and infrastructure.

```text
apps/web              User-facing workbench
apps/api              Control plane and domain orchestration
packages/contracts    Shared public/client contracts
docs                   Human documentation
compose.yml            Local infrastructure only
```

## `apps/web`

Next.js App Router application. The initial shell establishes the long-term navigation model:

- Workspace
- Projects
- Assets
- Generate
- Replication
- Storyboard
- Jobs
- Results
- Models
- Workflows
- Settings

The web app should talk to stable API resources. It must not know ComfyUI graph internals or model-specific transport payloads.

## `apps/api`

FastAPI Control Plane organized by responsibility:

```text
videoweave_api/
├── api/              HTTP transport
├── domain/           Stable enums/entities/spec concepts
├── services/         Use cases and orchestration (added as P0 grows)
└── infrastructure/   Storage, database, queue and executor adapters
```

Rules:

- `domain` imports no FastAPI, boto3, ComfyUI or database implementation.
- `api` converts HTTP requests into service/domain calls.
- `infrastructure` implements replaceable ports/adapters.
- long-running work becomes a Job.

## `packages/contracts`

Small TypeScript package for client-facing contracts. During P0, the FastAPI OpenAPI schema should become the canonical source for generated API clients; this package holds stable cross-UI concepts until generation is wired in.

Do not put model-specific parameters directly into shared core interfaces. Use namespaced extension data or capability-specific schemas.

## `docs/plans`

Contains the complete human-readable planning documents. These are not runtime dependencies.

## Local infrastructure

`compose.yml` starts development-only dependencies:

- PostgreSQL — authoritative metadata persistence
- Valkey — Redis-compatible coordination/cache foundation
- MinIO — local S3-compatible object storage

Production providers are intentionally not encoded into domain code.

## Next structural additions

Add these only when implementing the associated P0 capability:

```text
apps/api/src/videoweave_api/services/
apps/api/src/videoweave_api/infrastructure/database/
apps/api/src/videoweave_api/infrastructure/storage/
apps/api/src/videoweave_api/infrastructure/jobs/
apps/api/src/videoweave_api/infrastructure/executors/comfyui/
apps/api/src/videoweave_api/infrastructure/executors/diffusers/
```

Avoid empty architecture cosplay: directories should appear with their first real implementation.
