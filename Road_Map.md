# Solyra Roadmap

## Completed Phases
- [x] **Phase 1: Foundation & Core Infrastructure** — Workspace configuration, database substrates, core service scaffolds, and monorepo tooling.
- [x] **Phase 2: NeuroBus Core Messaging Layer** — Central runtime event bus architecture, priority-tiered queue dispatch (`REFLEX`, `CONTROL`, `SYNAPSE`, `STREAM` mapped to `CRITICAL`, `HIGH`, `NORMAL`, `BACKGROUND`), backpressure management, telemetry, and automated test harness.
- [x] **Phase 3: Persistence Engine & Vector Substrate** — Long-term memory storage, vector embeddings, relational indexing, and retrieval pipeline.
- [x] **Phase 3.5: NeuroBus Runtime Hardening** — Resolution of double-dispatch anomalies, continuous queue consumer loop, priority-aware shedding under saturation, explicit dispatch reporting, and end-to-end substrate integration.
- [x] **Phase 4.1: Foundation Contracts & DSL Substrate** — Shared contracts for Council member roles, brain package manifests, AST DSL schema, and automated verification harness (`commit f58bd1872053d18599e6a90f81e8eb84e59a858a`).
- [x] **Phase 4.2: Thalamus Event Routing & Gate Integration** — Priority-tiered event filtering, arousal threshold gating, dynamic signal suppression, telemetry exposure at `/thalamus/stats`, and test coverage.
- [x] **Phase 4.3: Council Consensus Engine** — Multi-role deliberation, 7-agent voting, veto enforcement, telemetry routing, and automated verification coverage.
- [x] **Phase 4.4: Brain Package Manager & Dynamic Runtime Loader** — Versioned package validation, deterministic module checksum enforcement, active package lifecycle tracking, rollback safety, event emission, and `/brain/stats` telemetry.

---

## Active Phase
### Phase 5: SOL Workshop & Dynamic Brain Evolution
- [x] **Phase 5.1: Bounded AST Validator & Canonical Serializer** — Deterministic AST validation, canonical JSON serialization, SHA-256 hashing, and `/ast/validate` + `/ast/stats` telemetry.
- [ ] **Phase 5.2: Dynamic AST Execution & Authoring Workbench** — Execution-safe AST evaluation, author feedback, and in-memory rule sandboxing.

---

## Future Phases
- Scalable local/hybrid storage substrates for multi-gigabyte pure code-logic rulebases, memory vectors, and dynamic weights.
- **Strict Author Immutability:** System identity, foundational self-preservation, safety invariants, and core constitution remain non-overwritable by dynamically loaded packages or runtime adaptation.
