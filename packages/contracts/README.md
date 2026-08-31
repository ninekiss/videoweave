# @videoweave/contracts

Shared client-facing contracts for the VideoWeave monorepo.

During P0, FastAPI/OpenAPI should become the canonical API schema source and generated clients should replace manually duplicated transport types. This package intentionally contains only stable high-level concepts for now.

Model-specific and workflow-specific payloads do not belong in the shared core contract.
