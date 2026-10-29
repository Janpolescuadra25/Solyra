# Solyra Roadmap

## Active Phase

- [x] **Step 14 Phase 1: Organization Data Contracts, Schema DDL Alignment & Persistence Layer** - COMPLETED
  - Added shared organization contracts, role enum, slug validation, and session augmentation in the contract package.
  - Implemented PostgreSQL and in-memory organization repositories with owner membership, member role management, and workspace linking semantics.
  - Added idempotent migration scripts and canonical schema alignment for `organizations`, `organization_members`, `organization_workspaces`, and `sessions.organization_id`.
  - Updated the auth middleware to enrich request context with organization membership and org role while preserving workspace-only sessions.
  > **Phase 1 Completed & Adjudicated:** Commit PIN `ceb1834fde11a5d7f69edad2cc42fe0a536ea5e5`. Architecture documentation: `Backend_Solyra/src/persistence/STEP14_PHASE1_README.md`.

### Upcoming Phase
- [ ] **Step 14 Phase 2: Organization Route Handlers & RBAC Middleware** - ACTIVE NEXT

## Future Phases
---
## ARCHIVED: Completed Historical Milestones
- [x] **Step 13: Chat Lifecycle, Enterprise Retention, and Multi-Tenant Isolation** - COMPLETED (`a009c8e97b54ff0d978186b3c8e1018dbac69b9e`)
  - Phase 1: Lifecycle Architecture & Multi-Tenant Scoping (Archive, Restore, Soft-Delete, Hard-Delete, Expiration calculation, Repository interfaces).
  - Phase 2: Schema Migration & Persistence Implementation (PostgreSQL & In-Memory repositories, conversation state columns, retention indexes, message cascading).
  - Phase 3: Retention Policy Engine & UI Controls (Batch background cleaner with re-entrancy protection, lifecycle REST endpoints, frontend filter tabs, retention badges, manual action controls).
- [x] **Step 12: Multi-Turn Memory Context, Streaming AST Execution & Council Orchestration** - Commit: 106af71a8c6ecbccbe758126cd419e10e879f848 - Completed & Verified (Multi-turn conversation history normalized via `ChatCompilerHistoryTurn` and `normalizeHistoryTurns()` with strict `validateBoundedAstProgram()` safety; real-time SSE streaming endpoint `GET /api/chat/conversations/:id/stream` with `AbortController` cleanup and ownership checks; `CouncilMemberRole.ORACLE` proposal routing with 5-minute cooldown and XSS sanitization; frontend `subscribeToChatStream()` with exponential backoff and `useEffect` lifecycle unmount cleanup; all integration test suites passing)
- [x] **Step 11: AST Chat Pipeline Integration & Chat-to-AST Compiler** - Commit: 32a7a306a9f28b15e78d9f0d83db69ad9eb67339 - Completed & Verified (75/75 backend suites pass; deterministic prompt-to-AST compilation via `compileChatPromptToAst()`, sensory input routing via `globalThalamus.routeInput('chat.*')`, live execution via `evaluateAstProgram()`, conversational history persistence with execution telemetry, and end-to-end frontend integration in `MemberRoutes.tsx`).
- [x] **Step 10: Strict Author Immutability & Brain Package Signature Verification** - Commit: 9c1ef5fd3004d66ef1ffad692fa5fad1ada809c5 - Completed & Verified (74/74 backend suites pass; Ed25519 asymmetric signature generation, verification, and tamper detection; immutable author constitutional constraints; fail-closed brain loader rejecting uncertified knowledge modifications).
- [x] **Step 9.5: Scalability Benchmarking, Progressive Disk Scaling & Operational Runbook** - Commit: b0056099f8fd887e6ad1ba9a2374a1b2ee759226 - Completed & Verified (74/74 backend suites pass; 10,000-session throughput benchmarks, 100MB/500MB/1GB memory ceilings with aggressive LRU eviction, progressive disk fallback under pressure, and comprehensive operational runbook in Backend_Solyra/src/persistence/OPERATIONS_RUNBOOK.md).

- [x] **Step 9.1: Foundation, Vector Alignment & Owner Seed** - Commit: f4430a51cb63ca8cb7992100b088054e41b634f2 - Completed & Verified (39/39 backend suites pass; semantic search implementation validated, fail-closed owner seed security guard tested, multi-tenant isolation preserved).
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
- [x] **Step 9.2: Local Hybrid Disk Substrate & LRU Cache** — Bounded LRUCache with TTL and NeuroBus telemetry, atomic DiskStorageEngine with two-way SHA-256 verification and path-traversal guards, TieredMemoryRepository with composite cache keys (`${tenantId}:${tier}:${key}`), and comprehensive test suite (completed in commit `99d7a09a79dc34a3ad183c69653415026d1a4ffb`).
- [x] **Step 9.3: Streaming Brain Loader & AST Chunking** — Completed & Verified (53/53 backend tests pass; streaming AST evaluation with cooperative event-loop yielding, chunked package storage/retrieval via DiskStorageEngine, tiered caching, and multi-tenant isolation preserved). Commit: `dd542878cf0ae3271cabbfeb2d3081368ae0f1a2`
- [x] **Step 9.4: Storage Substrate Acceptance Matrix & Production Wiring** (Completed: October 2026, Commit: `8c92ea4af60ce088bfcb5967416a50e30a1fdce0`)
  - Verified end-to-end storage substrate acceptance matrix covering InMemory, Postgres, Tiered Cache, DiskStorageEngine, and BrainPackageLoader.
  - Implemented `searchBySemanticSimilarity` on `InMemoryMemoryRepository` with dimensional validation and limit clamping.
  - Added backwards-compatible persistence injection to `BrainPackageLoader` with `getPersistence()` accessor.
  - Wired `/brain/evaluate` protected production endpoint with `authenticateProtectedRequest` guard and AST evaluator.
  - Validated 6 acceptance matrix test suites (`Backend_Solyra/test/step9.4_storage_acceptance_matrix.test.ts`) with zero regressions across the backend regression suite.

