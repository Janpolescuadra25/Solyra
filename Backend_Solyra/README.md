# Backend_Solyra (@solyra/backend)

Core cognitive service runtime, Brainstem, NeuroBus substrate, and API services.

## Status: PHASE 1 — DONE (Verified Runtime)

- **Runtime:** Node.js v22+ (TypeScript ES2022, Native ESM)
- **Port:** 4000 (configurable via BACKEND_PORT)
- **Verified Endpoints:**
  - GET /health — Basic liveness probe returning HTTP 200 (status: ok).
  - GET /ready — Readiness probe returning HTTP 200 (eady: true).

## Architecture Layout
- src/index.ts — Native HTTP server and route dispatcher.
- src/logger.ts — Structured JSON logger with standard metadata.