import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

import { LRUCache } from '../src/persistence/cache/lru-cache.js';
import { DiskStorageEngine } from '../src/persistence/disk/disk-storage.js';
import { TieredMemoryRepository } from '../src/persistence/cache/tiered-memory.repository.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('LRUCache', () => {
  test('retains insertion order and evicts proximal entries on overflow', () => {
    const cache = new LRUCache<string, string>({ maxEntries: 2, defaultTtlMs: 1000 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    assert.equal(cache.get('a'), 'A');
    cache.set('c', 'C');

    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 'A');
    assert.equal(cache.get('c'), 'C');
    assert.equal(cache.size, 2);
  });

  test('expires entries after ttl', async () => {
    const cache = new LRUCache<string, string>({ maxEntries: 5, defaultTtlMs: 1 });
    cache.set('d', 'D');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(cache.get('d'), undefined);
  });
});

describe('DiskStorageEngine', () => {
  test('writes payloads atomically and verifies integrity', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-disk-'));
    tempRoots.push(baseDir);

    const engine = new DiskStorageEngine({ baseDir, maxFileBytes: 1024 * 1024 });
    const payload = { ok: true, tenant: 'tenant-1', value: 42 };

    await engine.writeRecord('tenant-1', 'working', 'alpha', payload);
    const roundTrip = await engine.readRecord('tenant-1', 'working', 'alpha');

    assert.deepEqual(roundTrip, payload);
  });

  test('rejects traversal attempts and unsafe key names', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-disk-'));
    tempRoots.push(baseDir);

    const engine = new DiskStorageEngine({ baseDir, maxFileBytes: 1024 * 1024 });

    await assert.rejects(
      () => engine.writeRecord('../evil', 'working', 'alpha', { bad: true }),
      /invalid tenant/i,
    );

    await assert.rejects(
      () => engine.writeRecord('tenant-1', 'working', '../evil', { bad: true }),
      /invalid key/i,
    );
  });
});

describe('TieredMemoryRepository', () => {
  test('prefer cache hits and fall back to disk before primary storage', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-tiered-'));
    tempRoots.push(baseDir);

    const cache = new LRUCache<string, any>({ maxEntries: 10, defaultTtlMs: 60_000 });
    const disk = new DiskStorageEngine({ baseDir, maxFileBytes: 1024 * 1024 });
    const fallback = {
      async store(record: any) {
        return { success: true, data: record };
      },
      async retrieve() {
        return { success: true, data: null };
      },
      async searchBySalience() {
        return { success: true, data: [] };
      },
      async searchBySemanticSimilarity() {
        return { success: true, data: [] };
      },
      async delete() {
        return { success: true, data: true };
      },
    } as any;

    const repo = new TieredMemoryRepository({ cache, disk, primaryRepository: fallback });
    const record = {
      id: 'rec-1',
      tenantId: 'tenant-1',
      tier: 'working',
      key: 'alpha',
      content: 'alpha content',
      salience: 0.92,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };

    await repo.store(record as any);
    const cached = await repo.retrieve('tenant-1', 'working', 'alpha');

    assert.equal(cached.success, true);
    assert.equal(cached.data?.content, 'alpha content');
    assert.equal(cache.get('tenant-1:::working:::alpha')?.content, 'alpha content');

    await repo.delete('tenant-1', 'working', 'alpha');
    const deleted = await repo.retrieve('tenant-1', 'working', 'alpha');
    assert.equal(deleted.success, true);
    assert.equal(deleted.data, null);
  });
});
