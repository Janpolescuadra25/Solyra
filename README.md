# Solyra

## Current Status

> **Verified Baseline:** Phase 1 (COMPLETE) & Phase 2 (COMPLETE — NeuroBus, Brainstem, Homeostasis & Thalamus) **DONE**.  
> **Master Roadmap:** See [Road_Map.md](Road_Map.md) for master architecture and phase tracking.  
> **Active Milestone:** Milestone 1 (Minimum Viable Sol) — Phase 2 complete. Phase 3 (Auth, Users & Chat Foundation) next.

---

> Developmental Cognitive Architecture & Platform

## Canonical Architecture
- **Solyra:** The web and desktop application platform.
- **Sol:** The master cognitive agent.
- **Council of Four:** Sol's specialized inner cognitive system:
  - **Ash:** The Archivist (Offline control agent, \SOL_brain_storage\ specialist, zero-web reliance).
  - **Ben:** The Builder (Grounded response & artifact constructor).
  - **Cha:** The Scout and Plan Auditor (Sanitized web research & independent ledger audit).
  - **Yoshi:** The Planner (Task-ledger owner & dependency coordinator).

## Workspace Layout
- \Backend_Solyra/\ - Core cognitive services, NeuroBus, Brainstem, and API runtime.
- \Frontend_Solyra/\ - White glassmorphism client application (Chat UI, My Brain, AI Picker).
- \Docs/\ - System blueprints, specifications, and architecture maps (local reference).
- \Shared_Sol/\ - Shared schemas, typed NeuroBus frame definitions, and contracts.
- \Infrastructure_Sol/\ - Database migrations, Docker configs, and storage manifests.
- \Tests_Sol/\ - Benchmark suites, neuropsychological test batteries, and unit/integration tests.
- \Scripts_Sol/\ - Build, maintenance, and night consolidation utilities.

## Prerequisites
- Node.js v22+
- pnpm v10+
- Python 3.13+
- PostgreSQL 18+
- Git 2.50+

## License
Proprietary - Owned by JP.

## Phase 1: Foundation & Workspace Baseline — DONE

- **Repository Bootstrap:** Verified complete on branch main (origin/main).
- **Baseline Commits:**
  - Initial Scaffolding: c70b61dff0322d2343446d1376e6b4925dfcab86
  - Master Roadmap: 8ce3ecccf8358de7011dee46e867b74334703e3b
  - Documentation Sync: 73ab5cbc3eb48b2dad4a52a205ceb1321fd30c79
  - Workspace Runtime & Tooling: 30d662976bcf5f42f16488cfa1aa85ef588648bb
- **Verified Packages & Services:**
  - Shared_Sol/ (@solyra/shared) — Shared contracts & NeuroBus priority types.
  - Backend_Solyra/ (@solyra/backend) — Node.js runtime, structured logging, /health & /ready endpoints verified.
  - Frontend_Solyra/ (@solyra/frontend) — React 19 + Vite client shell, production build verified.
- **Current Status:** Phase 1 is complete. Ready for Phase 2 (Brainstem, Homeostasis, Thalamus & NeuroBus).
