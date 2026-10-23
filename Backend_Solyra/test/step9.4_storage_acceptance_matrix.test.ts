import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.SOLYRA_AUTH_TOKEN = 'test-ephemeral-secret-key';

const { server } = await import('../src/index.js');
import { InMemoryMemoryRepository } from '../src/persistence/in-memory/memory.repository.js';
import { BrainPackageLoader } from '../src/brain/loader.js';
import { createBrainPackageLoader, globalBrainLoader } from '../src/brain/index.js';
import { DiskStorageEngine } from '../src/persistence/disk/disk-storage.js';
import { LRUCache } from '../src/persistence/cache/lru-cache.js';
import { TieredMemoryRepository } from '../src/persistence/cache/tiered-memory.repository.js';
import { evaluateAstProgram, evaluateStreamingAstProgram, validateBoundedAstProgram } from '../src/ast/index.js';

const authToken = process.env.SOLYRA_AUTH_TOKEN ?? 'test-ephemeral-secret-key';

test.after(() => {
  if (server.listening) {
    server.close();
  }
});

function makeRuleProgram(body: unknown) {
  return {
    version: '1.0',
    programId: 'acceptance-rule',
    maxDepth: 32,
    body,
  };
}

async function sendJsonRequest(path: string, payload: unknown, withAuth: boolean): Promise<{ statusCode: number; body: any }> {
  return await new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address !== 'object') {
      reject(new Error('Server address unavailable'));
      return;
    }

    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(withAuth ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk.toString();
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: raw ? JSON.parse(raw) : {},
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

test('Step 9.4 Storage Substrate Acceptance Matrix', async (t) => {
  await t.test('1. InMemoryMemoryRepository implements IMemoryRepository and validates semantic similarity inputs', async () => {
    const repo = new InMemoryMemoryRepository();

    const invalid = await repo.searchBySemanticSimilarity('tenant-1', []);
    assert.equal(invalid.success, false);
    assert.match(String(invalid.error ?? ''), /non-empty array/i);

    const valid = await repo.searchBySemanticSimilarity('tenant-1', [0.1, 0.2, 0.3], 0.7, 5);
    assert.equal(valid.success, true);
    assert.deepEqual(valid.data, []);
  });

  await t.test('2. BrainPackageLoader constructor remains backward compatible and retains persistence injection', () => {
    const loader0 = new BrainPackageLoader();
    assert.equal(loader0.getPersistence(), undefined);

    const loader1 = new BrainPackageLoader({ maxHistoryLength: 50 });
    assert.equal(loader1.getPersistence(), undefined);

    const disk = new DiskStorageEngine();
    const loader2 = new BrainPackageLoader(undefined, disk);
    assert.equal(loader2.getPersistence(), undefined);

    const repo = new InMemoryMemoryRepository();
    const loader3 = new BrainPackageLoader({ maxHistoryLength: 10 }, disk, repo);
    assert.equal(loader3.getPersistence(), repo);
  });

  await t.test('3. createBrainPackageLoader factory wires persistence and disk correctly', () => {
    const repo = new InMemoryMemoryRepository();
    const loader = createBrainPackageLoader(undefined, undefined, repo);
    assert.ok(loader instanceof BrainPackageLoader);
    assert.equal(loader.getPersistence(), repo);
    assert.ok(globalBrainLoader instanceof BrainPackageLoader);
  });

  await t.test('4. TieredMemoryRepository and LRUCache are wired for production storage tiering', () => {
    const repo = new InMemoryMemoryRepository();
    const cache = new LRUCache();
    const tiered = new TieredMemoryRepository({ primaryRepository: repo, cache });
    assert.ok(tiered instanceof TieredMemoryRepository);
  });

  await t.test('5. AST streaming exports are available and executable', async () => {
    const program = makeRuleProgram([
      { type: 'ReturnStatement', value: { type: 'Literal', value: 42 } },
    ]);

    const validation = validateBoundedAstProgram(program as any);
    assert.equal(validation.valid, true);

    const syncResult = await evaluateAstProgram(program as any);
    assert.ok(syncResult !== undefined);

    const streamResult = await evaluateStreamingAstProgram(program as any);
    assert.ok(streamResult !== undefined);
  });

  await t.test('6. POST /brain/evaluate enforces auth and validates malformed input before execution', async () => {
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });
    }

    const unauthorized = await sendJsonRequest('/brain/evaluate', { program: makeRuleProgram([{ type: 'ReturnStatement', value: { type: 'Literal', value: 42 } }]) }, false);
    assert.equal(unauthorized.statusCode, 401);

    const malformed = await sendJsonRequest('/brain/evaluate', { program: null }, true);
    assert.equal(malformed.statusCode, 400);

    const validProgram = makeRuleProgram([
      { type: 'ReturnStatement', value: { type: 'Literal', value: 314 } },
    ]);

    const valid = await sendJsonRequest('/brain/evaluate', { program: validProgram }, true);
    assert.equal(valid.statusCode, 200);
    assert.equal(valid.body.success, true);
    assert.equal(valid.body.result, 314);
  });
});
