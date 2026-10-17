# Brain Package Loader

The Brain package loader is responsible for validating Brain package manifests, enforcing lifecycle transitions, and ensuring a loaded package’s declared module content matches the expected SHA-256 digest before any module is trusted at runtime.

## Subsystem Architecture

`BrainPackageLoader` sits between the shared package contract layer and runtime execution. It is responsible for:

- validating manifest shape, checksum format, and runtime constraints;
- tracking the active package state across `UNLOADED`, `VALIDATED`, `ACTIVE`, and `REJECTED` transitions;
- refusing invalid package replacements while preserving the previously active package;
- emitting lifecycle and module-integrity telemetry through the shared `globalBus`;
- exposing loader metrics via `GET /brain/stats`.

## Lifecycle States

The lifecycle model is intentionally fail-closed:

- `UNLOADED` — no active package is available.
- `VALIDATED` — manifest has passed schema and checksum checks.
- `ACTIVE` — the package is eligible for runtime consumption.
- `REJECTED` — validation failed and the package is not activated.

The loader transitions are:

1. `UNLOADED` -> `VALIDATED` during a successful manifest check.
2. `VALIDATED` -> `ACTIVE` when the package is accepted and attached.
3. `ACTIVE` -> `REJECTED` only when a validation failure occurs without replacing the active package.
4. `ACTIVE` -> `UNLOADED` when `unloadPackage()` is called.

## Manifest Constraints

The loader validates package manifests under the frozen contract:

- `schemaVersion` must be `1.0`.
- `brainId` and `version` must be non-empty strings.
- `runtimeConstraints` must contain positive numeric values for memory, runtime duration, and AST depth.
- `modules` must be an array.
- each module must include a non-empty `name`, valid `entryPoint`, supported `moduleType`, and a 64-character SHA-256 checksum.

Supported module types are:

- `DSL_RULESET`
- `INDEX_LOOKUP`
- `HEURISTIC`
- `GRAMMAR`

## Module Content Verification

`verifyModuleContent(moduleName, content)` computes the SHA-256 hash over the provided payload and compares it against the declared checksum in the active manifest.

```ts
const result = loader.verifyModuleContent('brain-rules', Buffer.from('rule-set-data'));
```

The method returns:

```ts
{
  valid: true,
  expected: '...',
  actual: '...'
}
```

If the runtime hash does not match the manifest checksum, the loader emits:

- `brain:module_hash_mismatch`

through `globalBus` with the `brainId`, `moduleName`, `expected`, `actual`, and `timestamp` payload fields.

## API Reference

### `extractAndValidateAst(moduleName, astProgram): AstValidationResult`

`extractAndValidateAst` gates AST payloads before they enter the execution pipeline. It verifies that the active module is of type `DSL_RULESET`, parses JSON string or Buffer payloads when needed, and validates the resulting AST against the active package's `runtimeConstraints.boundedAstDepth` bound.

```ts
const validation = loader.extractAndValidateAst('rule-module', serializedAst);
if (!validation.valid) {
  console.error(validation.errors);
}
```

The method returns the validation result from `validateBoundedAstProgram`, including any structural, depth, and typing failures encountered.

## Telemetry Exposure

The runtime exposes `/brain/stats` to report the package lifecycle and loader metrics. The endpoint returns the current state, active package identifier, version, loaded timestamp, total load/failure/unload counters, and active module count.

### `brain:ast_validation_failed`

The loader emits `brain:ast_validation_failed` when a `DSL_RULESET` payload fails AST validation. The payload includes:

```ts
{
  moduleName: string;
  errors: string[];
  timestamp: number;
}
```

This event is emitted for module type mismatches, malformed JSON, and bounded-depth/structural validation failures.

## Current Status

**Subsystem Status:** Milestone B: Step 3 Implemented (Steps 1–3 DONE)  
**Verification Date:** 2026-10-18  
**Step 1 Summary:** Implemented cryptographic module content verification via `verifyModuleContent`, SHA-256 hash checks with UTF-8/Buffer handling, and `brain:module_hash_mismatch` security event emission on `globalBus`.  
**Step 2 Summary:** Added `extractAndValidateAst`, enforced package-level `boundedAstDepth` validation for `DSL_RULESET` modules, and emitted `brain:ast_validation_failed` telemetry for malformed, mismatched, and over-depth AST payloads.  
**Step 3 Summary:** Added sandbox-aware AST execution through `executeModuleAst`, enforced manifest runtime constraints (`maxSteps`, `maxExecutionTimeMs`), and exposed the authenticated `POST /brain/execute` endpoint with structured success and violation telemetry.

The loader now verifies both module content integrity and AST structural soundness before runtime use, and the runtime enforces hard execution ceilings in fail-closed fashion to prevent unbounded CPU use.

## Runtime Constraints & Sandbox Execution

`BrainRuntimeConstraints` defines the runtime safety envelope used by the loaded package. In addition to the historical `maxMemoryBytes`, `maxExecutionTimeMs`, and `boundedAstDepth` settings, Step 3 adds optional `maxSteps` enforcement and a whitelist of `allowedExternalCalls`.

```ts
export interface BrainRuntimeConstraints {
  maxMemoryBytes?: number;
  maxMemoryMb?: number;
  maxExecutionTimeMs?: number;
  boundedAstDepth?: number;
  maxSteps?: number;
  allowedExternalCalls?: string[];
}
```

When `runtimeConstraints.maxSteps` is present, the value must be a positive integer. The `executeModuleAst` routine resolves the active package constraints, evaluates the AST via `evaluateAstProgram`, and fails closed on timeout or step-budget violations.

### `executeModuleAst(moduleId, inputPayload, contextOverrides)`

```ts
const result = await loader.executeModuleAst('module-rules', { score: 42 }, { mode: 'safe' });
```

This method:

- verifies that a package is loaded and the target module exists;
- ensures the module is executable and valid `DSL_RULESET` AST;
- resolves the active manifest constraints (`maxExecutionTimeMs`, `maxSteps`);
- invokes the evaluator with merged execution context;
- emits structured telemetry for either completion or sandbox violations.

## Authenticated Execution Endpoint

### `POST /brain/execute`

The endpoint requires a valid `Authorization: Bearer <token>` header, and accepts a JSON body shaped like:

```json
{
  "moduleId": "rule-module",
  "input": { "score": 42 },
  "contextOverrides": { "mode": "safe" }
}
```

Response envelope on success:

```json
{
  "success": true,
  "result": { "ok": true },
  "metrics": {
    "executionTimeMs": 8,
    "stepsExecuted": 3
  }
}
```

Response envelope on sandbox failure:

```json
{
  "success": false,
  "error": "Execution step limit of 1 exceeded",
  "metrics": {
    "executionTimeMs": 2,
    "stepsExecuted": 1
  }
}
```

HTTP status mapping:

- `401 Unauthorized` — missing or invalid Bearer token.
- `400 Bad Request` — missing `moduleId`, no active package, or unknown module.
- `422 Unprocessable Entity` — step budget or timeout violation.
- `200 OK` — successful AST execution.
- `500 Internal Server Error` — unexpected runtime failure.

## Telemetry Events

### `brain:execution_completed`

Published after a successful sandboxed execution with the package identifier, module identifier, execution duration, steps executed, and success flag.

```ts
{
  packageId: 'brain-alpha',
  moduleId: 'rule-module',
  executionTimeMs: 8,
  stepsExecuted: 3,
  success: true,
  timestamp: 1730000000000
}
```

### `brain:sandbox_violation`

Published whenever the runtime aborts due to a step limit or timeout violation. The payload includes the package identifier, offending module, reason, timing, and step count.

```ts
{
  packageId: 'brain-alpha',
  moduleId: 'rule-module',
  reason: 'Execution timeout of 10ms exceeded',
  executionTimeMs: 13,
  stepsExecuted: 7,
  success: false,
  timestamp: 1730000000000
}
```

## Current Status

**Milestone B Status:** Steps 1–3 DONE  
**Completed Step 1:** SHA-256 module verification.  
**Completed Step 2:** AST extraction and bounded validation.  
**Completed Step 3:** standardized runtime constraints, fail-closed sandbox enforcement, and authenticated execution endpoint workflow.

The package loader and backend runtime now enforce both structural and execution-level constraints before trust is granted to any loaded brain module.
