# Solyra Monorepo: Master Roadmap & Architectural Ledger

> **Governance Authority:** CYPRA (Architect) · Hydra (Auditor) · Mantra (Executor)  
> **Repository Strategy:** Single Monorepo with Domain Boundary Isolation (`Backend_Solyra`, `Shared_Sol`, `Frontend_Solyra`)  
> **Strict Operational Doctrine:** Fail-Closed · Zero Speculation · Primary Code Proof · Append-Only State Audits  
> **Last Verified Baseline PIN:** `8b6df265e059499c6f5100e16c406a6225395d3f`

---

## 1. Verified Commit PIN Registry

| Phase / Step | Target Scope | Commit PIN (SHA-1) | Status | Verification Authority |
| :--- | :--- | :--- | :--- | :--- |
| **Monorepo Init** | Directory structure, workspace configs, tsconfig | `dca207865239a51d93b37ea354c4f346a0907d7f` | Landed & Pushed | Hydra Verified |
| **Phase 1** | Autonomic Brainstem, Watchdog, State Machine | `8e6c71026d36e76cf0bf5715efbf69d656046e7f` | Landed & Pushed | Hydra Verified |
| **Phase 2.1** | Thalamus Routing, Homeostasis, NeuroBus | `4e1837fec3a1b3be5d984cfb7eb2576b5cfcf476` | Landed & Pushed | Hydra Verified |
| **Phase 2.2** | Cognitive Loop Verification Suite (9/9 pass) | `04fb3bebaa0b589a5d6ea16b89ae0764731a1034` | Landed & Pushed | Hydra Verified |
| **Phase 2.3** | Subsystem README Documentation & Verification | `c58d4cc37d6a7dc27a055fd7c4ba98dac72b846e` | Landed & Pushed | Hydra Verified |
| **Phase 3.1** | Multi-Tenant Domain Contracts & Repository Interfaces | `8b6df265e059499c6f5100e16c406a6225395d3f` | Landed & Pushed | Hydra Verified |
| Phase 3.2 | In-Memory Persistence Engine | `8b6df265e059499c6f5100e16c406a6225395d3f` | Landed & Pushed | Hydra Verified |

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
- **Status:** IN PROGRESS (Step 2 Complete)
- **Architecture Strategy:** Interface-driven repository pattern enabling modular in-memory, SQLite, or PostgreSQL backends.
- **Detailed Step Breakdown:**
  - [x] **Step 3.1: Multi-Tenant Domain Contracts & Repository Interfaces** (PIN: `8b6df265e059499c6f5100e16c406a6225395d3f`)
    - Implemented and exported in `Shared_Sol/src/index.ts`:
      - Core Entities: `User`, `TenantContext`, `Workspace`, `WorkspaceMembership`, `AuthSession`, `SessionTokenPayload`.
      - Conversation & Memory: `ChatMessage`, `Conversation`, `MemoryRecord`, `WorkingMemorySlot`.
      - Repositories: `IUserRepository`, `IWorkspaceRepository`, `IChatRepository`, `IMemoryRepository`, `RepositoryResult<T>`.
  - [x] **Step 3.2: Multi-Tenant In-Memory & Modular Persistence Engine**
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
| **Persistence Runtime** | Phase 3 | `MATURE` | In-memory repositories (User, Workspace, Chat, Memory) implemented in `Backend_Solyra/src/persistence/in-memory` with 100% test pass in `persistence.verify.ts` | None; persistence runtime verified. |
| **Authentication Engine** | Phase 3 | `NOT STARTED` | Token generation and session management pending Step 3.2. | Session invalidation and replay protection. |

---

## 4. Persistent Risk Register

1. **Risk 3.1: Untested Persistence Runtime Gaps**  
   - *Status:* RESOLVED (Verified at commit 8b6df265e059499c6f5100e16c406a6225395d3f)  
   - *Description:* Contracts exist in `Shared_Sol`, and `Backend_Solyra` now includes validated in-memory persistence adapters for multi-tenant repository enforcement.  
   - *Mitigation:* Step 3.2 is complete and verified by the persistence suite before standard external DB migration work begins.
2. **Risk 3.2: Multi-Tenant Data Leakage**  
   - *Status:* RESOLVED (Verified at commit 8b6df265e059499c6f5100e16c406a6225395d3f)  
   - *Description:* Repositories enforce tenant and workspace scoping on every query and mutation with explicit isolation checks and negative verification coverage.  
   - *Mitigation:* Continued repository-level validation through the persistence verification harness prevents cross-tenant contamination.

**Next Milestone:** Phase 3 Step 3.3: PostgreSQL Engine Migration & Database Schema