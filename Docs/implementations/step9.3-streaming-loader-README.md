# Step 9.3: Streaming Brain Loader & AST Chunking

Status: DONE (Step 9.3 Completed & Verified)

## Overview

Step 9.3 introduces a chunked, disk-backed loader model for brain AST rule sets. The design keeps the synchronous evaluator intact while adding an asynchronous streaming path that cooperatively yields to the event loop during long or intensive traversals.

## Architecture Summary

### 1. Streaming AST evaluation

The repository keeps `evaluateAstProgram` unchanged for backward compatibility. A new `evaluateStreamingAstProgram` is exported from `Backend_Solyra/src/ast/evaluator.ts` and accepts a loader callback, initial context, and standard evaluator options.

This streaming evaluator:

- resolves the AST through an async loader callback
- preserves sandbox safety, step limits, and timeout enforcement
- yields with `setImmediate` every 250 steps to avoid starving the event loop
- returns the same `AstExecutionResult` structure used by the synchronous evaluator

### 2. Disk-backed chunk storage

`DiskStorageEngine` remains the enforcement layer for path traversal prevention, stable file layout, and SHA-256 verification. Brain AST chunks are stored under the `brain-chunks` memory tier and keyed as:

`${brainId}-${version}-${chunkId}`

This layout is isolated by tenant and protects cross-tenant reads by validating both the tenant and chunk identifiers before any disk I/O is attempted.

### 3. Injectable brain loader

`BrainPackageLoader` now accepts an optional `DiskStorageEngine` instance via constructor dependency injection. The global singleton in `Backend_Solyra/src/brain/index.ts` is instantiated with `new DiskStorageEngine()` so runtime use is consistent with the repository’s fail-closed storage model.

### 4. Module query and chunk lifecycle methods

`BrainPackageLoader` now exposes:

- `getModuleByName(name)`
- `getModulesByType(type)`
- `storeModuleAstChunk(...)`
- `loadModuleAstChunk(...)`
- `deleteModuleAstChunk(...)`
- `executeModuleAstStreaming(...)`

These methods enforce identifier validation with `/^[a-zA-Z0-9_\-\.]+$/`, emit `brain:chunk_error` telemetry on invalid identifiers or missing chunks, and preserve disk integrity checks while operating in multi-tenant mode.

### 5. Chunk-aware AST validation

The `extractAndValidateAst` instance method accepts `options: { isChunk?: boolean }`. When chunk validation is requested, the method validates each node without applying the root-container depth constraint that normally governs full manifest programs.

This preserves the full package validation path while allowing chunk-level validation for lazy or streamed AST assembly.

## Verification

The Step 9.3 implementation is validated by the backend regression suite in `Backend_Solyra/test/step9.3_streaming_loader.test.ts`, covering:

- asynchronous AST execution
- cooperative yielding during long traversals
- synchronous compatibility
- chunk write/read/delete operations
- malicious identifier rejection
- multi-tenant isolation
- `brain-chunks` memory-tier acceptance
- module getter behavior
- streaming module execution telemetry

## Result

The loader now supports chunked, disk-backed AST execution while preserving the synchronous API and security guarantees already established in the repo.
