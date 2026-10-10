# Solyra Development Roadmap

## Active Phase: Phase 3.4 — Vector Embeddings & Semantic Search
- [ ] Research & implement embedding pipeline for agent memories and thought logs.
- [ ] Determine pgvector installation availability or maintain fallback JSONB cosine-similarity indexing.
- [ ] Expose semantic search interfaces on `@solyra/shared` persistence contracts.

---

## Completed Phases (Verified in Repository)

### Phase 0: Monorepo Foundation & Contract Setup
- Initialized pnpm monorepo structure (`Shared_Sol`, `Backend_Solyra`, `Frontend_Solyra`).
- Defined domain types, session interfaces, and memory models in `@solyra/shared`.

### Phase 1: Brainstem Engine & State Management
- Implemented core agent loop, reactive state machines, and session lifecycle.
- Integrated event bus and prompt templates.

### Phase 2: Action Item & Thought Log Runtime
- Established thought stream telemetry and deterministic action execution.
- Added session state serialization contracts.

### Phase 3.1 & 3.2: Persistence Architecture & In-Memory Adapters
- Modular repository pattern with dual-driver support (`PERSISTENCE_DRIVER=memory|postgres`).
- In-memory adapters fully passing standalone test suites.

### Phase 3.3: PostgreSQL Relational Persistence
- Resilient pg connection pooling (`pool.ts`) with SSL fallback and health checks.
- Full relational schema (`init_db.sql`, `schema.sql`, `rollback_schema.sql`).
- Relational adapters: AgentState, ActionItem, AgentSession, ThoughtLog.
- Integration test suite (`postgres.verify.ts`) passing against PostgreSQL 18.
