# Solyra Roadmap

## Active Phase
*Milestone B (Brain Package Lifecycle & Distribution) is complete. Next active phase under architectural deliberation.*

---

## Future Phases
- Scalable local/hybrid storage substrates for multi-gigabyte pure code-logic rulebases, memory vectors, and dynamic weights.
- **Strict Author Immutability:** System identity, foundational self-preservation, safety invariants, and core constitution remain non-overwritable by dynamically loaded packages or runtime adaptation.

---

## Historical Milestones (Completed & Preserved)
- [x] **Phase 1: Foundation & Core Infrastructure** — Workspace configuration, database substrates, core service scaffolds, and monorepo tooling.
- [x] **Phase 2: NeuroBus Core Messaging Layer** — Central runtime event bus architecture, priority-tiered queue dispatch (`REFLEX`, `CONTROL`, `SYNAPSE`, `STREAM` mapped to `CRITICAL`, `HIGH`, `NORMAL`, `BACKGROUND`), backpressure management, telemetry, and automated test harness.
- [x] **Phase 3: Persistence Engine & Vector Substrate** — Long-term memory storage, vector embeddings, relational indexing, and retrieval pipeline.
- [x] **Phase 3.5: NeuroBus Runtime Hardening** — Resolution of double-dispatch anomalies, continuous queue consumer loop, priority-aware shedding under saturation, explicit dispatch reporting, and end-to-end substrate integration.
- [x] **Phase 4.1: Foundation Contracts & DSL Substrate** — Shared contracts for Council member roles, brain package manifests, AST DSL schema, and automated verification harness (`commit f58bd1872053d18599e6a90f81e8eb84e59a858a`).
- [x] **Phase 4.2: Thalamus Event Routing & Gate Integration** — Priority-tiered event filtering, arousal threshold gating, dynamic signal suppression, telemetry exposure at `/thalamus/stats`, and test coverage.
- [x] **Phase 4.3: Council Consensus Engine** — Multi-role deliberation, 7-agent voting, veto enforcement, telemetry routing, and automated verification coverage.
- [x] **Phase 4.4: Brain Package Manager & Dynamic Runtime Loader** — Versioned package validation, manifest schema checksums, SHA-256 enforcement, active package lifecycle, rollback safety, event emission, and `/brain/stats` telemetry.
- [x] **Phase 5.1: Bounded AST Validator & Canonical Serializer** — Deterministic AST validation, canonical JSON serialization, prototype identifier defense, and validation telemetry at `/ast/validate` and `/ast/stats`.
- [x] **Phase 5.2: Dynamic AST Execution & Authoring Workbench** — Execution-safe AST evaluation, author feedback, standardized path pointers, diagnostic payloads, and runtime validation enforcement across `/ast/execute` and `/ast/workbench/inspect`.
- [x] **Milestone B Step 1: Module Content SHA-256 Verification** — Cryptographic verification of module content against manifest hashes, `verifyModuleContent` in `BrainPackageLoader`, and `brain:module_hash_mismatch` telemetry on `globalBus` (`commit 97316fe810b82c9ab43f84e5c1eee273f29268ee`).
- [x] **Step 2: Package AST Extraction & Validation** — Extraction of AST from `DSL_RULESET` module payloads, validation against manifest `boundedAstDepth`, and structured error reporting. (completed in commit 47fc9ec0b84a69cfa68c8d474a46a65071fff6d9)
- [x] **Milestone B Step 3: Sandbox Isolation & Execution** (completed in commit 02fb0db168c9cea5437ea0e65e4c66595312f955)
- [x] **Milestone B Step 4: Package Lifecycle & Distribution** — Bounded package history, rollback safety, version activation/deactivation, export packaging, 7 authenticated lifecycle API endpoints, and full test coverage (completed in commit 0bd054f86269c551918f45afac2328d3b203e4da)
