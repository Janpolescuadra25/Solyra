# @solyra/shared

Shared TypeScript contracts, types, and event schemas for the Solyra cognitive architecture.

## Overview
This package provides authoritative runtime and compile-time contracts shared across `@solyra/backend`, `@solyra/frontend`, and autonomous brain modules:
- **NeuroBus Event Frames:** Priority-tiered event structures and bus metrics.
- **Priority Tiering:** NeuroBus queue priorities (`REFLEX`, `CONTROL`, `SYNAPSE`, `STREAM`) mapped to runtime `SystemPriority` enums (`CRITICAL`, `HIGH`, `NORMAL`, `BACKGROUND`).
- **Arousal & Homeostasis:** System arousal levels (`LOW`, `NORMAL`, `HIGH`, `CRITICAL`), states, and component health records.
- **Council Schemas:** Role definitions (`COGNITIVE`, `ETHICAL`, `SAFETY`, `EXECUTIVE`, `MEMORY`, `COMMUNICATION`, `ORCHESTRATOR`) and evaluation tasks.
- **Brain Package Manifests:** Validation schemas, capability declarations, and dependencies for pure code-logic brain packages.
- **AST / DSL Schemas:** Abstract Syntax Tree definitions for safe dynamic rule compilation and execution.

## Build & Test
```bash
# Build TypeScript output
pnpm --filter @solyra/shared build

# Run contract verification harness
pnpm --filter @solyra/shared test
```
