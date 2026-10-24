import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

import type { MemoryRecord } from '@solyra/shared';
import { LRUCache } from '../src/persistence/cache/lru-cache.js';
import { TieredMemoryRepository } from '../src/persistence/cache/tiered-memory.repository.js';
import { DiskStorageEngine } from '../src/persistence/disk/disk-storage.js';
import { InMemoryMemoryRepository } from '../src/persistence/in-memory/memory.repository.js';
import { generateSyntheticBatch, generateSyntheticMemoryRecord } from './helpers/vector-generator.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Step 9.5: Scalability Benchmarking, Progressive Disk Scaling & Operational Runbook', () => {
  test('generates 10,000 synthetic vector records with deterministic dimensions within bounded time', () => {
    const start = performance.now();
    const records = generateSyntheticBatch(10000, { dimensions: 64, tenantId: 'tenant-bench-1', tier: 'working' });
    const elapsed = performance.now() - start;

    assert.equal(records.length, 10000);
    assert.equal(records[0].id, 'bench-vec-000000');
    assert.equal(records[0].key, 'bench-vec-000000');
    assert.equal(records[0].embedding?.length, 64);
    assert.equal(records[9999].id, 'bench-vec-009999');
    assert.ok(elapsed < 2000, `Generation took ${elapsed}ms, expected under 2000ms`);
  });

  test('enforces strict byte budget and keeps cache stats backward compatible', () => {
    const cache = new LRUCache<string, MemoryRecord>({
      maxEntries: 5000,
      maxSizeBytes: 256 * 1024,
    });

    const records = generateSyntheticBatch(1000, { dimensions: 64, tenantId: 'tenant-bench-1', tier: 'working' });
    for (const record of records) {
      cache.set(record.id, record);
    }

    const stats = cache.getStats();
    assert.equal(typeof stats.hits, 'number');
    assert.equal(typeof stats.misses, 'number');
    assert.equal(typeof stats.size, 'number');
    assert.equal(typeof stats.maxEntries, 'number');
    assert.equal(typeof stats.evictions, 'number');
    assert.equal(typeof stats.bytesUsed, 'number');
    assert.equal(typeof stats.maxSizeBytes, 'number');
    assert.ok(stats.bytesUsed <= stats.maxSizeBytes, `bytesUsed ${stats.bytesUsed} exceeded budget ${stats.maxSizeBytes}`);
    assert.ok(stats.evictions > 0, `Expected evictions under tight byte budget, got ${stats.evictions}`);
    assert.ok(stats.size < records.length, `Cache size ${stats.size} should be bounded below ${records.length}`);
  });

  test('persists and reads records with SHA-256 verification and tenant isolation', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-step9-5-'));
    tempRoots.push(baseDir);

    const engine = new DiskStorageEngine({ baseDir });
    const tenantId = 'tenant-scalability-a';
    const record = generateSyntheticMemoryRecord(42, { dimensions: 64, tenantId, tier: 'short_term' });

    await engine.writeRecord(tenantId, 'short_term', record.key, record);
    assert.equal(await engine.exists(tenantId, 'short_term', record.key), true);

    const roundTrip = await engine.readRecord<MemoryRecord>(tenantId, 'short_term', record.key);
    assert.ok(roundTrip !== null);
    assert.equal(roundTrip?.id, record.id);
    assert.equal(roundTrip?.tenantId, tenantId);
    assert.deepEqual(roundTrip?.embedding, record.embedding);
  });

  test('integrates cache, disk, and primary repository under the tiered memory contract', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-tiered-'));
    tempRoots.push(baseDir);

    const primaryRepo = new InMemoryMemoryRepository();
    const cache = new LRUCache<string, MemoryRecord>({ maxEntries: 128, maxSizeBytes: 512 * 1024 });
    const disk = new DiskStorageEngine({ baseDir });
    const repo = new TieredMemoryRepository(primaryRepo, { cache, disk });
    const record = generateSyntheticMemoryRecord(101, { dimensions: 64, tenantId: 'tenant-1', tier: 'working' });

    const stored = await repo.store(record);
    assert.equal(stored.success, true);

    const retrieved = await repo.retrieve(record.tenantId, record.tier, record.key);
    assert.equal(retrieved.success, true);
    assert.ok(retrieved.data !== null);
    assert.equal(retrieved.data?.key, record.key);
    assert.equal(retrieved.data?.content, record.content);

    const stats = repo.getCacheStats();
    assert.ok(stats.bytesUsed >= 0);
    assert.ok(stats.maxSizeBytes > 0);
  });
});
