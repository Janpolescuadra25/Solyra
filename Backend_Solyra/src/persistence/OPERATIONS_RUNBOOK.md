# Solyra Storage Substrate: Operational Runbook

**Module:** `Backend_Solyra/src/persistence`  
**Target Substrates:** `DiskStorageEngine`, `LRUCache`, `TieredMemoryRepository`  
**Associated Milestones:** Step 9.2 (Hybrid Substrate), Step 9.5 (Scalability Benchmarks & Runbook)  
**Classification:** Production Operations Guide

---

## 1. Overview & Architecture Reference

The Solyra storage architecture is a tiered hybrid substrate designed to balance low-latency session retrieval with bounded memory consumption and crash-resilient disk durability:
- **L1 (Hot Tier):** In-memory `LRUCache` enforcing byte-level budgets (default: 100MB; configurable up to 1GB) with sub-millisecond lookups.
- **L2 (Warm/Cold Tier):** Multi-tenant isolated `DiskStorageEngine` providing transactional JSON persistence with atomic writes (`.tmp` -> `.json` rename) and directory isolation per tenant ID.
- **Coordination Layer:** `TieredMemoryRepository` managing transparent tier promotion, asynchronous disk flushes, and background eviction workflows.
- **Telemetry & Event Bus:** `NeuroBus` emitting structured storage events (`storage:eviction`, `storage:cache_miss`, `storage:disk_write`, `storage:integrity_failure`).

---

## 2. Cache Warm-Up Procedures

Cold-start scenarios (service restarts, pod redeployments, or node migrations) initiate with an empty L1 cache. The following warm-up workflows prevent downstream latency spikes and disk thrashing.

### 2.1 Automated Hot-Session Preloading
When initializing `TieredMemoryRepository` on boot, configure warm-up hooks to query recently active sessions from the metadata index:
1. **Target Selection:** Identify active tenant sessions updated within the last 24 hours (or top N sessions by access frequency).
2. **Sequential Batching:** Ingest sessions in batches of 50 to prevent event-loop starvation during node startup:
   ```typescript
   // Operational Warm-Up Sequence
   const activeSessionIds = await indexService.getRecentActiveSessions({ maxAgeHours: 24, limit: 500 });
   for (let i = 0; i < activeSessionIds.length; i += 50) {
     const batch = activeSessionIds.slice(i, i + 50);
     await Promise.all(batch.map(id => tieredRepo.get(id))); // Promotes into L1 LRU cache
   }
   ```
3. **Telemetry Assertion:** Monitor `storage:cache_miss` and `storage:cache_hit` metrics on `NeuroBus`. Warm-up is deemed complete once hit ratio stabilizes above 85% on synthetic health checks.

### 2.2 Cold-Start Mitigation & Rate Limiting
- Enable progressive warm-up throttling if system memory utilization exceeds 65% during startup.
- If L1 byte budget is reached during preloading, eviction will trigger automatically. Ensure preloading order prioritizes critical/active sessions first.

---

## 3. Retention Policies & Byte-Budgeting Enforcement

To prevent Out-Of-Memory (OOM) fatal crashes under high concurrency (e.g., 10,000 concurrent sessions), strict byte budgeting is enforced at the `LRUCache` level.

### 3.1 Memory Tier Ceilings & Sizing Matrix
| Environment | Max Byte Budget | Target Session Capacity | Eviction Policy | High-Water Mark |
|-------------|-----------------|-------------------------|-----------------|-----------------|
| Dev / Test  | 100 MB (`104857600`) | ~1,000 sessions   | Strict LRU      | 80% (80 MB)     |
| Staging     | 500 MB (`524288000`) | ~5,000 sessions   | Strict LRU      | 85% (425 MB)    |
| Production  | 1,024 MB (`1073741824`) | ~10,000+ sessions | Strict LRU   | 85% (870 MB)    |

### 3.2 Progressive Disk Eviction Workflow
1. **High-Water Mark Trigger:** When total payload size in `LRUCache` reaches the configured byte budget, insertions trigger eviction of the Least Recently Used (LRU) entry.
2. **Durability Handshake:**
   - Before an in-memory session is pruned from L1, `TieredMemoryRepository` ensures dirty state has been flushed to `DiskStorageEngine`.
   - The evicted session payload is discarded from memory; subsequent reads hit L2 disk storage and dynamically promote back to L1 if memory permits.
3. **Telemetry & Alerting:**
   - `NeuroBus` emits `storage:eviction` with `{ sessionId, tenantId, evictedBytes, remainingBytes }`.
   - Alert Threshold: Alert if eviction frequency exceeds 200 events/second continuously for 5 minutes, indicating undersized L1 budget for current working set.

---

## 4. Failover Recovery & Directory Maintenance

`DiskStorageEngine` stores tenant data under isolated directories using atomic file transactions to ensure crash resilience.

### 4.1 Crash Recovery & Stale Lock Cleanup
If the host process crashes unexpectedly during a disk write operation:
1. **Atomic Invariant:** Writes occur to a temporary file (`.tmp.[uuid]`) before atomic renaming to `[sessionId].json`. A crash mid-write leaves orphaned `.tmp` files without corrupting existing session records.
2. **Stale Lock / Temp File Purge Procedure:**
   - On service initialization, scan the storage root for `.tmp.*` files older than 10 minutes.
   - Run manual cleanup if orphaned files accumulate:
     ```powershell
     # PowerShell Maintenance One-Liner
     Get-ChildItem -Path "Backend_Solyra/storage" -Recurse -Filter "*.tmp.*" | 
       Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-10) } | 
       Remove-Item -Force
     ```
3. **Directory Recreation:** If a tenant directory is accidentally deleted, `DiskStorageEngine.ensureTenantDir(tenantId)` automatically recreates the folder tree with mode `0700` upon the next write operation.

### 4.2 Storage Root Migration & Relocation
To relocate storage to an alternate mount (e.g., dedicated NVMe volume):
1. Stop the application service (`pm2 stop solyra-backend` or system service).
2. Synchronize existing files preserving permissions:
   `rsync -avz --progress /old/storage/path/ /mnt/nvme/solyra/storage/`
3. Update `STORAGE_ROOT` in `Backend_Solyra/.env`.
4. Validate permissions: ensure service user possesses read/write/execute rights on the destination root.
5. Restart service and inspect startup logs for clean directory binding.

---

## 5. Data Integrity Monitoring & Validation

Data corruption prevention is critical for multi-tenant state and brain knowledge representations.

### 5.1 SHA-256 Checksum Verification
- Every serialized payload written to disk can be accompanied by an integrity header or sidecar SHA-256 checksum.
- Validation algorithm:
  ```typescript
  import { createHash } from "crypto";

  export function verifyPayloadChecksum(rawContent: string, expectedHash: string): boolean {
    const computedHash = createHash("sha256").update(rawContent, "utf8").digest("hex");
    return computedHash === expectedHash;
  }
  ```

### 5.2 Quarantine & Recovery Procedure
If a file read returns invalid JSON or fails checksum validation:
1. **Immediate Quarantine:** Move corrupted file to `storage/quarantine/[tenantId]/[sessionId].[timestamp].corrupt`. Do NOT overwrite or delete.
2. **Telemetry Alert:** Emit `storage:integrity_failure` via `NeuroBus` with `{ tenantId, sessionId, error }`.
3. **Fallback Retrieval:** If configured, retrieve the latest snapshot from backup or replay event logs to reconstruct session state.
4. **Log Incident:** File operator ticket with diagnostic details from the quarantine directory.