# Solyra Roadmap

## Active Phase

- [ ] **Step 9: Scalable Local/Hybrid Storage Substrates**
  - [x] **Step 9.1: Foundation, Vector Alignment & Owner Seed** — Memory semantic similarity alignment, fail-closed owner account seeding (`paulescuadra25@gmail.com`), and test harness (completed in commit `27a8aef39173a57a7e7d8554c323b4592525a594`).
  - [ ] **Step 9.2: Local Hybrid Disk Substrate & LRU Cache** — Bounded off-heap cache and disk-backed tiered storage for high-volume AST rulebases.
  - [ ] **Step 9.3: Streaming Brain Loader & AST Chunking** — Lazy evaluation and chunked package streaming to remove in-memory ceilings.
  - [ ] **Step 9.4: Storage Substrate Acceptance Matrix** — Multi-gigabyte rule validation, stress benchmarks, and concurrency gates.

## Future Phases
- Scalable local/hybrid storage substrates for multi-gigabyte pure code-logic rulebases, memory vectors, and dynamic weights.
- **Strict Author Immutability:** System identity, foundational self-preservation, safety invariants, and core constitution remain non-overwritable by dynamically loaded packages or runtime adaptation.

---

## Historical Milestones (Completed & Preserved)
- [x] **Step 9.1: Foundation, Vector Alignment & Owner Seed** — Implemented `IMemoryRepository.searchBySemanticSimilarity` with PostgreSQL `cosine_similarity`, parameter validation (minSimilarity, limit), fail-closed idempotent owner seeding script (`paulescuadra25@gmail.com`) requiring `OWNER_INITIAL_PASSWORD`, added `"db:seed"` package script, and 39/39 passing test suite (completed in commit `27a8aef39173a57a7e7d8554c323b4592525a594`).

## ARCHIVED: Completed Historical Milestones
- [x] **Step 8: End-to-End Integration & Security Acceptance Matrix** - Commit: 3910f9f81031f9fa6ad06c5d6f7c6aeb1fbb3a90 - Completed & Verified (5/5 acceptance matrix suites, 35/35 full backend suites pass; automated multi-pillar coverage across authentication, session revocation, regular-user chat lifecycle, owner administration, and audit event streams).
- [x] **Step 7: Master Owner Administration Control Center** â€” Completed & Remediated (All 6 defect areas resolved; 30/30 backend tests pass; typechecks and frontend build verified clean). Implemented full multi-panel owner dashboard with brain monitoring, package rollback, user role management, session revocation, audit logging, and system telemetry. Added backend security guards, admin API endpoints, and comprehensive test coverage (commit `f65e80554158702294c8b9b839d630353dff0094`).
- [x] **Phase 1: Foundation & Core Infrastructure** â€” Workspace configuration, database substrates, core service scaffolds, and monorepo tooling.
- [x] **Phase 2: NeuroBus Core Messaging Layer** â€” Central runtime event bus architecture, priority-tiered queue dispatch (`REFLEX`, `CONTROL`, `SYNAPSE`, `STREAM` mapped to `CRITICAL`, `HIGH`, `NORMAL`, `BACKGROUND`), backpressure management, telemetry, and automated test harness.
- [x] **Phase 3: Persistence Engine & Vector Substrate** â€” Long-term memory storage, vector embeddings, relational indexing, and retrieval pipeline.
- [x] **Phase 3.5: NeuroBus Runtime Hardening** â€” Resolution of double-dispatch anomalies, continuous queue consumer loop, priority-aware shedding under saturation, explicit dispatch reporting, and end-to-end substrate integration.
- [x] **Phase 4.1: Foundation Contracts & DSL Substrate** â€” Shared contracts for Council member roles, brain package manifests, AST DSL schema, and automated verification harness (`commit f58bd1872053d18599e6a90f81e8eb84e59a858a`).
- [x] **Phase 4.2: Thalamus Event Routing & Gate Integration** â€” Priority-tiered event filtering, arousal threshold gating, dynamic signal suppression, telemetry exposure at `/thalamus/stats`, and test coverage.
- [x] **Phase 4.3: Council Consensus Engine** â€” Multi-role deliberation, 7-agent voting, veto enforcement, telemetry routing, and automated verification coverage.
- [x] **Phase 4.4: Brain Package Manager & Dynamic Runtime Loader** â€” Versioned package validation, manifest schema checksums, SHA-256 enforcement, active package lifecycle, rollback safety, event emission, and `/brain/stats` telemetry.
- [x] **Phase 5.1: Bounded AST Validator & Canonical Serializer** â€” Deterministic AST validation, canonical JSON serialization, prototype identifier defense, and validation telemetry at `/ast/validate` and `/ast/stats`.
- [x] **Phase 5.2: Dynamic AST Execution & Authoring Workbench** â€” Execution-safe AST evaluation, author feedback, standardized path pointers, diagnostic payloads, and runtime validation enforcement across `/ast/execute` and `/ast/workbench/inspect`.
- [x] **Milestone B Step 1: Module Content SHA-256 Verification** â€” Cryptographic verification of module content against manifest hashes, `verifyModuleContent` in `BrainPackageLoader`, and `brain:module_hash_mismatch` telemetry on `globalBus` (`commit 97316fe810b82c9ab43f84e5c1eee273f29268ee`).
- [x] **Step 2: Package AST Extraction & Validation** â€” Extraction of AST from `DSL_RULESET` module payloads, validation against manifest `boundedAstDepth`, and structured error reporting. (completed in commit 47fc9ec0b84a69cfa68c8d474a46a65071fff6d9)
- [x] **Milestone B Step 3: Sandbox Isolation & Execution** (completed in commit 02fb0db168c9cea5437ea0e65e4c66595312f955)
- [x] **Milestone B Step 4: Package Lifecycle & Distribution** â€” Bounded package history, rollback safety, version activation/deactivation, export packaging, 7 authenticated lifecycle API endpoints, and full test coverage (completed in commit 0bd054f86269c551918f45afac2328d3b203e4da)
- [x] **Step 1: Foundation, Shared Contracts & Schema Hardening** â€” Extend `@solyra/shared` contracts with account states, session lifecycle, onboarding progress, and audit event types. Extend PostgreSQL schema with `sessions`, `email_outbox`, `audit_events`, and `tokens` tables. Add password hashing (`argon2` or `bcrypt`) and JWT/session utilities to `@solyra/backend`. (completed in commit 1270b849c1c97512ac76706b08cb452351e3de5c)
- [x] **Step 2: Core Authentication & Session Backend** â€” Implemented signup, email verification outbox, login/logout, revocable sessions, authentication middleware, 5 security hardening controls (SafeUserDto sanitization, fail-closed JWT, atomic verification transactions, inactive account block, RateLimiter stale key cleanup), and 23 passing tests in `@solyra/backend`. (completed in commit `1c0855081cd2029ab3ca2d156a2e0f0fae6af066`)
- [x] **Step 3: Account Security, Recovery & Onboarding Backend** â€” Implemented forgot/reset password token flows, account lockouts, rate limiting extensions, onboarding status tracking in `users`, and audit logging in `@solyra/backend`. (completed in commit 746c803b4285b0d4d1c7b106e0ab86084d0ca7ff)
- [x] **Step 4: Frontend Application Foundation & Routing** â€” Implemented React Router v6, TailwindCSS v3, 3-tier auth context, route guards, unified Axios API client, and reverse proxy configuration in `@solyra/frontend` (completed in commit `1d5151bd6caa752cbbb43ee45e55994a893aa4a4`).
- [x] **Step 5: User Authentication & Resumable Onboarding UI** â€” Implemented responsive login, signup, email verification, password reset, 3-tier auth context with profile hydration, top-header shell layout, and resumable 3-step onboarding wizard in `@solyra/frontend` (completed in commit `3a730c04a1ca5309372d6558429766c580b32156`).


