# Solyra Persistence Subsystem

**Status:** IMPLEMENTED & VERIFIED  
**Verified Commit PIN:** `8b6df265e059499c6f5100e16c406a6225395d3f`  
**Test Suite:** `Backend_Solyra/test/persistence.verify.ts` (PASS - Exit code 0)  

---

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

---

## Operational Runbook & Maintenance

For production operational procedures, failure recovery guides, and cache tuning:
- **Operations Runbook:** [`OPERATIONS_RUNBOOK.md`](./OPERATIONS_RUNBOOK.md)
- **Key Operational Coverage:**
  - **Cache Warm-Up:** Preloading hot tenant sessions on boot without event-loop starvation.
  - **Memory Ceilings & Byte-Budgeting:** 100MB (dev), 500MB (staging), 1GB (prod) LRU limits with automated disk eviction.
  - **Failover & Directory Repair:** Stale temporary lock purge, crash-recovery atomic file renames, and mount migrations.
  - **Integrity Validation:** SHA-256 checksum validation, corrupted payload quarantine, and incident alerting.
