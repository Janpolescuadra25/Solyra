# AST Subsystem (Phase 5: SOL Workshop & Dynamic Brain Evolution)

**COMPLETION STATUS: DONE**  
**Subsystem Status:** Complete & Verified (Phase 5.1 & Phase 5.2)  
**Verification Date:** 2026-10-17  

**Module Path:** `Backend_Solyra/src/ast/`  
**Shared Contracts:** `Shared_Sol/src/ast.ts`

---

## 1. Overview
The AST subsystem provides deterministic validation and isolated evaluation of Solyra Domain Specific Language (DSL) programs. It enforces computational bounds, memory safety, prototype pollution defenses, execution isolation, and standardized author feedback for validation/runtime failures.

## 2. Architecture & Components
- **`validator.ts` (`validateBoundedAstProgram`)**:
  - Validates programs against the canonical AST node set and rejects invalid nodes before execution.
  - Tracks structured path pointers such as `root`, `body[0]`, or `body[0].consequent[1]` to attribute each rule failure precisely.
  - Emits `AstValidationError` objects containing `path`, `code`, `message`, `nodeType`, and optional `nodeId` metadata.
- **`evaluator.ts` (`evaluateAstProgram`)**:
  - Executes bounded AST programs within an isolated, null-prototype scope to prevent runtime object pollution.
  - Carries a traversal path through nested expressions to attribute execution failure origin precisely.
  - Builds `AstExecutionDiagnostic` metadata containing `path`, `code`, `message`, `nodeType`, `nodeId`, and `step` when a runtime failure occurs.
  - Buffers emitted events into an isolated `events` array without leaking state to the live app bus.
- **`index.ts`**:
  - Exposes validation and execution diagnostics through `/ast/validate`, `/ast/execute`, and `/ast/workbench/inspect`.

## 3. Author Feedback Model
The shared author-feedback contract lives in `Shared_Sol/src/ast.ts` and is consumed by the validator and runtime evaluator.

- `AstValidationError`
  - `path`: exact traversal pointer (`root`, `body[0]`, `consequent.body[1]`)
  - `code`: stable machine-readable failure code such as `INVALID_IDENTIFIER`, `UNAUTHORIZED_CALL`, `BUDGET_EXCEEDED_DEPTH`, or `PROTOTYPE_POLLUTION`
  - `message`: human-readable explanation
  - `nodeType` and `nodeId`: optional metadata for the failing AST node
- `AstExecutionDiagnostic`
  - `path`: current execution traversal pointer in the active AST path
  - `code`: stable runtime code such as `DIVISION_BY_ZERO`, `STEP_BUDGET_EXCEEDED`, `TIMEOUT_EXCEEDED`, or `RUNTIME_ERROR`
  - `message`: human-readable runtime explanation
  - `step`: execution count at failure time
  - `details`: optional structured debug metadata for debugging the failure

## 4. HTTP Endpoints
- `POST /ast/execute`: Executes a bounded AST program, returns `execution.diagnostic` on failure, and exposes `diagnostic` at the response root for callers.
- `POST /ast/validate`: Validates an AST program without execution and returns structured validation diagnostics.
- `POST /ast/workbench/inspect`: Returns validation plus execution diagnostics for author tooling and inspection workflows.
- `GET /ast/stats`: Returns telemetry for validation and execution counts.

## 5. Verification
- Unit test suites:
  - `Backend_Solyra/test/ast_validator.test.ts`
  - `Backend_Solyra/test/ast_evaluator.test.ts`
- Regression coverage includes path-based runtime diagnostics for division-by-zero and step-budget exhaustion.
