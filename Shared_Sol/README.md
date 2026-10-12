# @solyra/shared

Shared TypeScript contracts, types, and event schemas for the Solyra cognitive architecture.

## Overview
This package provides authoritative runtime and compile-time contracts shared across `@solyra/backend`, `@solyra/frontend`, and autonomous brain modules:
- **NeuroBus Event Frames:** Priority-tiered event structures and bus metrics.
- **Priority Tiering:** Runtime bus priorities use `SystemPriority` values (`REFLEX`, `SURVIVAL`, `USER`, `LEARNING`, `IDLE`). These are the active queue priorities for routing and dispatch.
- **Arousal & Homeostasis:** Runtime arousal values are `ArousalLevel` entries (`sleep`, `drowsy`, `alert`, `hyperaroused`) with enum keys `SLEEP`, `DROWSY`, `ALERT`, and `HYPERAROUSED`.
- **Council Schemas:** Role definitions for the tri-agent governance layer and task ledger contracts.
- **Brain Package Manifests:** Validation schemas, capability declarations, and dependency metadata for pure code-logic brain packages.
- **AST / DSL Schemas:** Abstract Syntax Tree definitions for safe dynamic rule compilation and execution.

## Core Runtime Contracts

### SystemPriority
```ts
export const SystemPriority = {
  REFLEX: 'REFLEX',
  SURVIVAL: 'SURVIVAL',
  USER: 'USER',
  LEARNING: 'LEARNING',
  IDLE: 'IDLE'
} as const;
```

### ArousalLevel
```ts
export const ArousalLevel = {
  SLEEP: 'sleep',
  DROWSY: 'drowsy',
  ALERT: 'alert',
  HYPERAROUSED: 'hyperaroused'
} as const;
```

## Build & Test
```bash
# Build TypeScript output
pnpm --filter @solyra/shared build

# Run contract verification harness
pnpm --filter @solyra/shared test
```
