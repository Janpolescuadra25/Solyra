# Solyra Backend Persistence Subsystem

This package provides repository-style adapters for local, isolated persistence and validation before runtime integration with external databases.

## Components

- `in-memory/user.repository.ts`: user cache with email uniqueness and tenant-scoped lookup.
- `in-memory/workspace.repository.ts`: workspace registry with slug uniqueness and workspace memberships.
- `in-memory/chat.repository.ts`: conversation thread registry and message sequence storage.
- `in-memory/memory.repository.ts`: memory tier store keyed by `(tenantId, tier, key)` and filtered by salience.
- `index.ts`: barrel exports and the `createInMemoryPersistence()` factory.

## Invariants

1. **Tenant isolation**: all repository reads/writes are explicitly scoped to the tenant and workspace producing the operation.
2. **Immutability**: in-memory adapters clone data on read/write to prevent external mutation of internal state.
3. **Local-first**: these adapters are intended for validation, tests, and ephemeral state before external persistence is connected.
