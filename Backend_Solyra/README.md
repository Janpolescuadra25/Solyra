# Backend_Solyra

Core cognitive service runtime, Brainstem, NeuroBus substrate, and API services.

## Status: PHASE 1 STEP 2 — ACTIVE RUNTIME

- **Runtime:** Node.js v22+ (TypeScript ES2022, Native ESM)
- **Port:** 4000 (configurable via `BACKEND_PORT`)
- **Endpoints:**
  - `GET /health` — Basic liveness probe and uptime monitor.
  - `GET /ready` — Readiness probe reporting Brainstem and Homeostasis state.

## Architecture Layout
- `src/index.ts` — Native HTTP server and route dispatcher.
- `src/logger.ts` — Structured JSON logger with standard metadata.
