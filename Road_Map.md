# Solyra Development Roadmap

> **Current Baseline PIN**: `27a3ead1958e10d54b5be5ed747b2e01cb73ab25`  
> **Master Architecture Reference**: Solyra Platform System Technical Documentation v1.0 (2026-10-09)

---

## Active Phase: Phase 3 — Multi-Tenant Architecture & Persistence Substrate
**Status: IN PROGRESS (Relational Storage Implemented, Vector & Runtime Wiring Deferred)**

### Implemented & Verified Baseline
- [x] **Phase 0: Monorepo Foundation & Contract Setup** — Verified pnpm monorepo (`Shared_Sol`, `Backend_Solyra`, `Frontend_Solyra`).
- [x] **Phase 1: Workspace Bootstrap & Health Runtime** — Verified `/health` and `/ready` endpoints.
- [x] **Phase 2: Autonomic Core Subsystems** — Verified Priority NeuroBus (`REFLEX`..`IDLE`), Brainstem state machine, Homeostasis monitor, and Thalamus router (11 assertions passing in `brainstem.verify.ts`).
- [x] **Phase 3.1: Domain Type Contracts** — Defined core models and abstract repository contracts in `Shared_Sol/src/index.ts`.
- [x] **Phase 3.2: In-Memory Persistence Engine** — Verified `InMemoryUserRepository`, `InMemoryWorkspaceRepository`, `InMemoryChatRepository`, and `InMemoryMemoryRepository` with composite tier indexing (all tests passing in `persistence.verify.ts`).
- [x] **Phase 3.3: PostgreSQL Relational Persistence Baseline** — Implemented connection pool with SSL handling (`createPostgresPool`, `getPgPool`), relational schemas (`init_db.sql`, `schema.sql`, `rollback_schema.sql`), and 4 repository adapters (`user`, `workspace`, `chat`, `knowledge`) verified by 14 assertions in `postgres.verify.ts`.
- [x] **Runtime Environment Fact**: Runtime probe confirmed `pgvector` is `NOT_INSTALLED`. Architecture targets PostgreSQL 18 JSONB cosine-similarity fallback for vector embeddings.

### Active Remaining Work in Phase 3
- [ ] **Contract & Repository Alignment**: Implement `memory.repository.ts` in `postgres/repositories/` to satisfy `IMemoryRepository` contract from `Shared_Sol`.
- [ ] **Runtime Persistence Wiring**: Replace hardcoded `storage: 'connected'` stub in `Backend_Solyra/src/index.ts` with live database health reporting via `checkPostgresHealth()`.
- [ ] **Phase 3.4 Vector Embeddings & Semantic Search**:
  - Implement JSONB float-array cosine similarity functions in PostgreSQL 18.
  - Implement vector embedding contracts on `@solyra/shared`.
  - Add vector search verification tests.

---

## Upcoming Milestones
- **Phase 4**: Cognitive Loop, Wernicke Comprehension Engine & DLPFC Reasoning Best-First Beam Search
- **Phase 5**: StyleStore, Broca Construction Engine & Citation-Only Articulation
- **Phase 6**: Sol_Brain_Storage Hybrid Tiering (Hot/Warm/Cold/Glacial) & Blood-Brain Barrier (2-of-3 Rule)
- **Phase 7**: Thinking Difficulty Router (Reflex, Fast, Medium, Expert, Expert-Deep) & Homeostatic Arousal Capping
- **Phase 8**: Council of Four Protocol (Ash, Ben, Cha, Yoshi) & Immutable Task Ledger
- **Phase 9**: 5-Layer Retrieval Augmentation Engine (Stem, Thesaurus, Hypernym, Co-occurrence, Char N-gram)
