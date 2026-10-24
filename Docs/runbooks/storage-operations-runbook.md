# Solyra Operational Runbook: Storage Operations & Recovery

## Scope
This runbook covers the tiered storage stack for Step 9.5: the LRU cache, progressive disk spillover, and durable fallback repository behavior. It is intended for operators who need to warm caches, recover from disk corruption, and validate storage health under bounded heap conditions.

## 1. Architecture Overview
Solyra uses a three-tier memory strategy:

1. Hot memory: `LRUCache` inside the application process.
2. Warm storage: `DiskStorageEngine` writing encrypted-safe JSON envelopes to tenant-specific paths under `os.tmpdir()` or the configured base directory.
3. Durable fallback: primary repository storage such as PostgreSQL memory records.

## 2. SOP: Cache Warm-Up
- Identify high-salience records by tenant and tier.
- Preload the `LRUCache` during startup for active memory partitions.
- Keep `maxEntries` and `maxSizeBytes` budgets aligned with process memory limits.
- Compare `cache.getStats().bytesUsed` against `maxSizeBytes` during telemetry checks.

## 3. SOP: Progressive Disk Spillover
- Use `TieredMemoryRepository` to write to primary storage and mirror to disk when configured.
- Verify `exists(tenantId, tier, key)` before a read retry, then fall back to the primary repository if the disk record is absent or mismatched.
- Periodically prune stale keys and delete records with `deleteRecord()` to keep disk consumption bounded.

## 4. SHA-256 Integrity Recovery
- `DiskStorageEngine.readRecord()` validates the stored `sha256` against the payload before returning data.
- If a mismatch is detected, fail closed, emit telemetry, and rehydrate from the authoritative primary repository.
- Regenerate the record with `writeRecord()` once the source of truth is recovered.

## 5. Capacity Monitoring
Monitor the following indicators:

- `LRUCache.getStats().bytesUsed`
- `LRUCache.getStats().evictions`
- Disk usage per tenant and memory tier
- Tiered repository read latency and p95 values
- Primary repository fallback rate after cache misses

## 6. Escalation
Escalate to the service owner when:

- `bytesUsed` exceeds 85% of the configured budget for more than five minutes
- disk integrity warnings are detected across more than one tenant
- primary storage fallback rates increase sharply during normal traffic
