# Solyra Monorepo: Master Roadmap & Architectural Ledger

> **Governance Authority:** CYPRA (Architect) · Hydra (Auditor) · Mantra (Executor)  
> **Repository Strategy:** Single Monorepo with Domain Boundary Isolation (`Backend_Solyra`, `Shared_Sol`, `Frontend_Solyra`)  
> **Strict Operational Doctrine:** Fail-Closed · Zero Speculation · Primary Code Proof · Append-Only State Audits  
> **Last Verified Baseline PIN:** `08dd56ba55d1364de6695600754002c70f57cbc7`

---

## 1. Verified Commit PIN Registry

| Phase / Step | Target Scope | Commit PIN (SHA-1) | Status | Verification Authority |
| :--- | :--- | :--- | :--- | :--- |
| **Monorepo Init** | Directory structure, workspace configs, tsconfig | `dca207865239a51d93b37ea354c4f346a0907d7f` | Landed & Pushed | Hydra Verified |
| **Phase 1** | Autonomic Brainstem, Watchdog, State Machine | `8e6c71026d36e76cf0bf5715efbf69d656046e7f` | Landed & Pushed | Hydra Verified |
| **Phase 2.1** | Thalamus Routing, Homeostasis, NeuroBus | `4e1837fec3a1b3be5d984cfb7eb2576b5cfcf476` | Landed & Pushed | Hydra Verified |
| **Phase 2.2** | Cognitive Loop Verification Suite (9/9 pass) | `04fb3bebaa0b589a5d6ea16b89ae0764731a1034` | Landed & Pushed | Hydra Verified |
| **Phase 2.3** | Subsystem README Documentation & Verification | `c58d4cc37d6a7dc27a055fd7c4ba98dac72b846e` | Landed & Pushed | Hydra Verified |
| **Phase 3.1** | Multi-Tenant Domain Contracts & Repository Interfaces | `08dd56ba55d1364de6695600754002c70f57cbc7` | Landed & Pushed | Hydra Verified |

---

## 2. Milestone 1: Minimum Viable Solyra (MVS) — Engine Baseline

### Phase 0: Monorepo Foundation & Contract Scaffold
- **Status:** `COMPLETE` (`MATURE`)
- **Key Deliverables:**
  - `pnpm-workspace.yaml`, TypeScript project references, root linting and formatting.
  - `@solyra/shared` contract library foundation.
- **Verification:** Clean monorepo builds via `pnpm -r run build`.

### Phase 1: Autonomic Brainstem (Core Liveness & Resiliency)
- **Status:** `COMPLETE` (`MATURE`)
- **Key Deliverables:**
  - Brainstem lifecycle manager (`BOOTING` -> `RUNNING` -> `DEGRADED` -> `SHUTTING_DOWN` -> `OFFLINE`).
  - Active Heartbeat dispatcher with configurable pulse intervals.
  - Autonomous Watchdog timer with automatic subsystem recovery hooks.
  - Clean POSIX signal handling (`SIGINT`, `SIGTERM`) for deterministic shutdown.
- **Subsystem Documentation:** `Backend_Solyra/src/brainstem/README.md`.
- **Verification:** Unit tests and regression suite pass (`brainstem.verify.ts`).

### Phase 2: Cognitive Loop & Subsystem Federation
- **Status:** `COMPLETE` (`FUNCTIONAL`)
- **Key Deliverables:**
  - **Thalamus:** Dynamic message router dispatching tasks across sensory, memory, reasoning, and autonomic loops.
  - **Homeostasis:** Continuous health monitor tracking component stress, latency, and operational thresholds.
  - **NeuroBus:** Inter-module event bus supporting prioritized messaging, async pub/sub, and backpressure telemetry.
- **Subsystem Documentation:** 
  - `Backend_Solyra/src/thalamus/README.md`
  - `Backend_Solyra/src/homeostasis/README.md`
  - `Backend_Solyra/src/neurobus/README.md`
- **Verification:** 9/9 subsystem verification checks passing in `Backend_Solyra/test/brainstem.verify.ts`.

### Phase 3: Persistence, Memory, & Context Pipeline
- **Status:** `IN PROGRESS` (`PARTIAL - Step 1 Complete`)
- **Architecture Strategy:** Interface-driven repository pattern enabling modular in-memory, SQLite, or PostgreSQL backends.
- **Detailed Step Breakdown:**
  - [x] **Step 3.1: Multi-Tenant Domain Contracts & Repository Interfaces** (PIN: `08dd56ba55d1364de6695600754002c70f57cbc7`)
    - Implemented and exported in `Shared_Sol/src/index.ts`:
      - Core Entities: `User`, `TenantContext`, `Workspace`, `WorkspaceMembership`, `AuthSession`, `SessionTokenPayload`.
      - Conversation & Memory: `ChatMessage`, `Conversation`, `MemoryRecord`, `WorkingMemorySlot`.
      - Repositories: `IUserRepository`, `IWorkspaceRepository`, `IChatRepository`, `IMemoryRepository`, `RepositoryResult<T>`.
  - [ ] **Step 3.2: Multi-Tenant In-Memory & Modular Persistence Engine**
    - Build `InMemoryUserRepository`, `InMemoryWorkspaceRepository`, `InMemoryChatRepository`, and `InMemoryMemoryRepository` adhering strictly to `@solyra/shared` contracts.
    - Wire persistence instances into `Backend_Solyra` bootstrap with dependency injection.
    - Comprehensive unit and integration test suite asserting tenant isolation and atomic state mutations.
  - [ ] **Step 3.3: PostgreSQL Engine Migration & Database Schema**
    - PostgreSQL schema definitions, migration scripts, and connection pool management using configured `DATABASE_URL`.
    - Integration tests validating real relational persistence against containerized/local PostgreSQL 18.
  - [ ] **Step 3.4: Context Window Assembly & Retrieval Engine**
    - Long-term memory semantic search and working memory scratchpad integration.
    - Context token budgeting and truncation defense for LLM context windows.

---

## 3. §15 Subsystem Maturity Matrix

| Subsystem / Component | Phase | Maturity Level | Primary Code Proof | Residual Risk / Open Items |
| :--- | :--- | :--- | :--- | :--- |
| **Brainstem Lifecycle** | Phase 1 | `MATURE` | `Backend_Solyra/src/brainstem/index.ts`, `test/brainstem.verify.ts` | None; verified zero regression. |
| **Heartbeat & Watchdog** | Phase 1 | `MATURE` | Liveness assertion verified across all test runs. | None. |
| **Thalamus Router** | Phase 2 | `FUNCTIONAL` | `Backend_Solyra/src/thalamus/index.ts`, verified message routing. | Dynamic handler unregistration edge cases. |
| **Homeostasis Monitor** | Phase 2 | `FUNCTIONAL` | `Backend_Solyra/src/homeostasis/index.ts`, metric tracking. | Alert threshold auto-tuning under heavy load. |
| **NeuroBus Event Mesh** | Phase 2 | `FUNCTIONAL` | `Backend_Solyra/src/neurobus/index.ts`, priority queues verified. | High-concurrency backpressure under burst traffic. |
| **Subsystem Documentation** | Phase 2 | `MATURE` | READMEs for Brainstem, Thalamus, Homeostasis, NeuroBus. | Ensure continuous sync with API changes. |
| **Domain Type Contracts** | Phase 3 | `MATURE` | `Shared_Sol/src/index.ts` exported contracts. | None; compiles cleanly across monorepo. |
| **Persistence Runtime** | Phase 3 | `NOT STARTED` | Zero repository implementations in `Backend_Solyra/src`. | Mocked state hazard; needs Step 3.2 execution. |
| **Authentication Engine** | Phase 3 | `NOT STARTED` | Token generation and session management pending Step 3.2. | Session invalidation and replay protection. |

---

## 4. Persistent Risk Register

1. **Risk 3.1: Untested Persistence Runtime Gaps**  
   - *Status:* `OPEN`  
   - *Description:* Contracts exist in `Shared_Sol`, but `Backend_Solyra` currently runs purely in-process autonomic services with zero persistence wiring.  
   - *Mitigation:* Deliver Step 3.2 with strict adherence to `RepositoryResult<T>` and isolated multi-tenant unit test suites before wiring into live API routes.
2. **Risk 3.2: Multi-Tenant Data Leakage**  
   - *Status:* `OPEN`  
   - *Description:* Repositories must enforce strict `tenantId` / `workspaceId` scoping on every query and mutation to prevent cross-tenant data contamination.  
   - *Mitigation:* Require explicit `TenantContext` parameters on all repository methods and implement negative tests verifying cross-tenant access rejection.