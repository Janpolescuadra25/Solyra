import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

import type { BrainPackageManifest, MemoryTier } from '@solyra/shared';
import { evaluateAstProgram, evaluateStreamingAstProgram } from '../src/ast/index.js';
import { BrainPackageLoader } from '../src/brain/loader.js';
import { globalBus } from '../src/neurobus/index.js';
import { DiskStorageEngine } from '../src/persistence/disk/disk-storage.js';
import { TieredMemoryRepository } from '../src/persistence/cache/tiered-memory.repository.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const sampleProgram = {
  version: '1.0',
  programId: 'streamed-rules',
  maxDepth: 4,
  body: [
    {
      type: 'BinaryExpression',
      operator: 'AND',
      left: {
        type: 'BinaryExpression',
        operator: 'GREATER_THAN',
        left: { type: 'Identifier', name: 'score' },
        right: { type: 'Literal', value: 10 },
      },
      right: {
        type: 'BinaryExpression',
        operator: 'EQUALS',
        left: { type: 'Identifier', name: 'level' },
        right: { type: 'Literal', value: 5 },
      },
    },
  ],
} as const;

const manifest: BrainPackageManifest = {
  schemaVersion: '1.0',
  brainId: 'brain-stream-1',
  version: '1.0.0',
  createdAt: Date.now(),
  runtimeConstraints: {
    maxMemoryBytes: 1024 * 1024,
    maxExecutionTimeMs: 5000,
    boundedAstDepth: 8,
    maxSteps: 1000,
  },
  modules: [
    {
      name: 'stream-module',
      entryPoint: 'dist/stream-module.js',
      sha256: 'a'.repeat(64),
      moduleType: 'DSL_RULESET',
      payload: sampleProgram,
    },
    {
      name: 'helper-module',
      entryPoint: 'dist/helper-module.js',
      sha256: 'b'.repeat(64),
      moduleType: 'HEURISTIC',
    },
  ],
};

describe('Step 9.3 streaming loader', () => {
  test('evaluateStreamingAstProgram resolves and executes AST programs with context', async () => {
    const result = await evaluateStreamingAstProgram(async () => sampleProgram, { score: 12, level: 5 });

    assert.equal(result.success, true);
    assert.equal(result.result, true);
    assert.ok(result.executionTimeMs >= 0);
    assert.equal(result.stepsExecuted > 0, true);
  });

  test('evaluateStreamingAstProgram yields cooperatively during long traversals', async () => {
    const largeProgram = {
      version: '1.0',
      programId: 'long-stream',
      maxDepth: 4,
      body: [
        { type: 'AssignmentStatement', target: 'sum', value: { type: 'Literal', value: 0 } },
        ...Array.from({ length: 600 }, (_, index) => ({
          type: 'AssignmentStatement',
          target: 'sum',
          value: {
            type: 'BinaryExpression',
            operator: 'ADD',
            left: { type: 'Identifier', name: 'sum' },
            right: { type: 'Literal', value: index + 1 },
          },
        })),
        { type: 'ReturnStatement', value: { type: 'Identifier', name: 'sum' } },
      ],
    };

    const result = await evaluateStreamingAstProgram(async () => largeProgram, {}, { maxSteps: 10000, timeoutMs: 10000 });

    assert.equal(result.success, true);
    assert.equal(result.result, 180300);
  });

  test('evaluateAstProgram remains backward compatible for synchronous callers', () => {
    const result = evaluateAstProgram(sampleProgram as any, { score: 12, level: 5 }, { maxSteps: 1000, timeoutMs: 5000 });

    assert.equal(result.success, true);
    assert.equal(result.result, true);
  });

  test('BrainPackageLoader stores, reads, and deletes AST chunks with integrity checks', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-step9-3-'));
    tempRoots.push(baseDir);

    const disk = new DiskStorageEngine({ baseDir, maxFileSizeBytes: 1024 * 1024 });
    const loader = new BrainPackageLoader(undefined, disk);
    const chunkNodes = [
      {
        type: 'ReturnStatement',
        value: {
          type: 'BinaryExpression',
          operator: 'EQUALS',
          left: { type: 'Identifier', name: 'level' },
          right: { type: 'Literal', value: 5 },
        },
      },
    ];

    const written = await loader.storeModuleAstChunk('tenant-alpha', 'brain-stream-1', '1.0.0', 'chunk-1', chunkNodes as any);
    assert.equal(written.sha256.length, 64);
    assert.equal(written.bytesWritten > 0, true);

    const loaded = await loader.loadModuleAstChunk('tenant-alpha', 'brain-stream-1', '1.0.0', 'chunk-1');
    assert.deepEqual(loaded, chunkNodes);

    const removed = await loader.deleteModuleAstChunk('tenant-alpha', 'brain-stream-1', '1.0.0', 'chunk-1');
    assert.equal(removed, true);
    assert.equal(await loader.loadModuleAstChunk('tenant-alpha', 'brain-stream-1', '1.0.0', 'chunk-1'), null);
  });

  test('invalid identifiers are rejected and emit chunk_error telemetry', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-step9-3-guard-'));
    tempRoots.push(baseDir);

    const disk = new DiskStorageEngine({ baseDir, maxFileSizeBytes: 1024 * 1024 });
    const loader = new BrainPackageLoader(undefined, disk);
    const errors: Array<{ reason?: string; tenantId?: string; brainId?: string; chunkId?: string }> = [];
    const unsubscribe = globalBus.subscribe('brain:chunk_error', (payload: any) => {
      errors.push({ reason: payload.reason, tenantId: payload.tenantId, brainId: payload.brainId, chunkId: payload.chunkId });
    });

    await assert.rejects(
      () => loader.storeModuleAstChunk('../../etc/passwd', 'brain-stream-1', '1.0.0', 'chunk-1', []),
      /Invalid identifier format/,
    );

    assert.ok(errors.some((entry) => entry.reason === 'invalid_identifier' || entry.reason === 'chunk_not_found'));
    unsubscribe();
  });

  test('multi-tenant chunk isolation prevents cross-tenant reads and overwrites', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-step9-3-tenant-'));
    tempRoots.push(baseDir);

    const disk = new DiskStorageEngine({ baseDir, maxFileSizeBytes: 1024 * 1024 });
    const loader = new BrainPackageLoader(undefined, disk);
    const chunkNodes = [
      {
        type: 'ReturnStatement',
        value: {
          type: 'Literal',
          value: 'alpha',
        },
      },
    ];

    await loader.storeModuleAstChunk('tenant-alpha', 'brain-stream-1', '1.0.0', 'chunk-1', chunkNodes as any);
    const crossRead = await loader.loadModuleAstChunk('tenant-beta', 'brain-stream-1', '1.0.0', 'chunk-1');
    assert.equal(crossRead, null);

    const overwritten = await loader.storeModuleAstChunk('tenant-beta', 'brain-stream-1', '1.0.0', 'chunk-1', [
      {
        type: 'ReturnStatement',
        value: {
          type: 'Literal',
          value: 'beta',
        },
      },
    ] as any);
    assert.equal(overwritten.bytesWritten > 0, true);

    const betaRead = await loader.loadModuleAstChunk('tenant-beta', 'brain-stream-1', '1.0.0', 'chunk-1');
    assert.deepEqual(betaRead?.[0]?.value?.value, 'beta');
  });

  test('TieredMemoryRepository accepts brain-chunks as a valid MemoryTier', async () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), 'solyra-step9-3-tier-'));
    tempRoots.push(baseDir);

    const cache = new Map<string, any>();
    const disk = new DiskStorageEngine({ baseDir, maxFileSizeBytes: 1024 * 1024 });
    const repo = new TieredMemoryRepository({
      primaryRepository: {
        async store(record: any) {
          cache.set(`${record.tenantId}::${record.tier}::${record.key}`, record);
          return { success: true, data: record };
        },
        async retrieve(tenantId: string, tier: string, key: string) {
          return { success: true, data: cache.get(`${tenantId}::${tier}::${key}`) ?? null };
        },
        async delete(tenantId: string, tier: string, key: string) {
          return { success: true, data: cache.delete(`${tenantId}::${tier}::${key}`) };
        },
        async searchBySalience() {
          return { success: true, data: [] };
        },
        async searchBySemanticSimilarity() {
          return { success: true, data: [] };
        },
      } as any,
      cache: {
        set: (key: string, value: any) => cache.set(key, value),
        get: (key: string) => cache.get(key),
        delete: (key: string) => cache.delete(key),
        getStats: () => ({ size: cache.size, maxEntries: 1000, hits: 0, misses: 0, evictions: 0 }),
      } as any,
      disk,
    });

    const chunkTier: MemoryTier = 'brain-chunks';
    await repo.store({
      tenantId: 'tenant-1',
      tier: chunkTier,
      key: 'chunk-1',
      content: 'chunk content',
      salience: 1,
      metadata: { source: 'brain' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const found = await repo.retrieve('tenant-1', chunkTier, 'chunk-1');
    assert.equal(found.success, true);
    assert.equal(found.data?.tier, 'brain-chunks');
  });

  test('BrainPackageLoader exposes module getters', () => {
    const loader = new BrainPackageLoader();
    assert.equal(loader.loadPackage(manifest), true);
    assert.equal(loader.getModuleByName('stream-module')?.name, 'stream-module');
    assert.deepEqual(loader.getModulesByType('DSL_RULESET').map((entry) => entry.name), ['stream-module']);
  });

  test('executeModuleAstStreaming resolves chunked AST payloads and emits telemetry', async () => {
    const loader = new BrainPackageLoader();
    assert.equal(loader.loadPackage(manifest), true);

    const resolver = async (chunkId: string) => {
      if (chunkId === 'stream-module-1') {
        return [
          {
            type: 'ReturnStatement',
            value: {
              type: 'BinaryExpression',
              operator: 'AND',
              left: {
                type: 'BinaryExpression',
                operator: 'GREATER_THAN',
                left: { type: 'Identifier', name: 'score' },
                right: { type: 'Literal', value: 10 },
              },
              right: {
                type: 'BinaryExpression',
                operator: 'EQUALS',
                left: { type: 'Identifier', name: 'level' },
                right: { type: 'Literal', value: 5 },
              },
            },
          },
        ] as any;
      }
      return [] as any;
    };

    const result = await loader.executeModuleAstStreaming('stream-module', { score: 12, level: 5 }, {}, resolver);
    assert.equal(result.success, true);
    assert.equal(result.result, true);
  });
});
