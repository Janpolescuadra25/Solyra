import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';

const { server } = await import('../src/index.js');
import { globalBus } from '../src/neurobus/index.js';
import { globalBrainLoader } from '../src/brain/index.js';
import type { BrainPackageManifest } from '@solyra/shared';

console.log('--- Running Brain Package Loader Test Suite ---');

const validManifest: BrainPackageManifest = {
  schemaVersion: '1.0',
  brainId: 'brain-alpha',
  version: '1.2.3',
  createdAt: Date.now(),
  runtimeConstraints: {
    maxMemoryBytes: 1024 * 1024,
    maxExecutionTimeMs: 5000,
    boundedAstDepth: 10,
  },
  modules: [
    {
      name: 'core-rules',
      entryPoint: 'dist/core-rules.js',
      sha256: 'a'.repeat(64),
      moduleType: 'DSL_RULESET',
    },
  ],
};

const invalidSchemaManifest: BrainPackageManifest = {
  ...validManifest,
  schemaVersion: '2.0',
  brainId: 'brain-invalid-schema',
  version: '2.0.0',
};

const invalidShaManifest: BrainPackageManifest = {
  ...validManifest,
  brainId: 'brain-invalid-sha',
  modules: [
    {
      ...validManifest.modules[0],
      sha256: 'zzzz',
    },
  ],
};

const invalidTypeManifest: BrainPackageManifest = {
  ...validManifest,
  brainId: 'brain-invalid-type',
  modules: [
    {
      ...validManifest.modules[0],
      moduleType: 'BAD_TYPE' as any,
    },
  ],
};

const events = {
  loaded: [] as Array<{ brainId: string; version: string }>,
  unloaded: [] as Array<{ brainId: string; version: string }>,
  failed: [] as Array<{ brainId: string; version: string; errors: string[] }>,
};

const unsubLoaded = globalBus.subscribe('brain:package_loaded', (payload: any) => {
  events.loaded.push({ brainId: payload.brainId, version: payload.version });
});
const unsubUnloaded = globalBus.subscribe('brain:package_unloaded', (payload: any) => {
  events.unloaded.push({ brainId: payload.brainId, version: payload.version });
});
const unsubFailed = globalBus.subscribe('brain:validation_failed', (payload: any) => {
  events.failed.push({ brainId: payload.brainId, version: payload.version, errors: payload.errors ?? [] });
});

async function requestStats(): Promise<{ statusCode: number; body: any }> {
  return await new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr !== 'object') {
      reject(new Error('Server address unavailable'));
      return;
    }

    const req = http.get({ host: '127.0.0.1', port: addr.port, path: '/brain/stats' }, (res) => {
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
  });
}

try {
  // 1. Validation rejects invalid manifests
  assert.strictEqual(globalBrainLoader.validateManifest(invalidSchemaManifest).valid, false);
  assert.strictEqual(globalBrainLoader.validateManifest(invalidShaManifest).valid, false);
  assert.strictEqual(globalBrainLoader.validateManifest(invalidTypeManifest).valid, false);
  console.log('✓ Manifest validation rejects bad schema, checksum, and module type inputs');

  // 2. Valid package loads and state becomes ACTIVE
  const loaded = globalBrainLoader.loadPackage(validManifest);
  assert.strictEqual(loaded, true);
  assert.strictEqual(globalBrainLoader.getLifecycleState(), 'ACTIVE');
  assert.deepStrictEqual(globalBrainLoader.getActivePackage(), validManifest);
  assert.ok(events.loaded.some((entry) => entry.brainId === validManifest.brainId));
  console.log('✓ Valid package loads successfully and transitions to ACTIVE');

  // 3. Invalid package does not replace active package (rollback guarantee)
  const invalidLoad = globalBrainLoader.loadPackage({
    ...validManifest,
    brainId: 'brain-bad',
    version: '9.9.9',
    modules: [{ ...validManifest.modules[0], sha256: '0'.repeat(63) }],
  });
  assert.strictEqual(invalidLoad, false);
  assert.deepStrictEqual(globalBrainLoader.getActivePackage(), validManifest);
  assert.ok(events.failed.some((entry) => entry.brainId === 'brain-bad'));
  console.log('✓ Failed package load preserves the active package state');

  // 4. Unload returns to UNLOADED
  const unloaded = globalBrainLoader.unloadPackage();
  assert.strictEqual(unloaded, true);
  assert.strictEqual(globalBrainLoader.getLifecycleState(), 'UNLOADED');
  assert.strictEqual(globalBrainLoader.getActivePackage(), null);
  assert.ok(events.unloaded.some((entry) => entry.brainId === validManifest.brainId));
  console.log('✓ Package unload resets lifecycle state and telemetry');

  // 5. Telemetry endpoint returns JSON structure
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const telemetry = await requestStats();
  assert.strictEqual(telemetry.statusCode, 200);
  assert.ok(typeof telemetry.body.state === 'string');
  assert.ok(typeof telemetry.body.totalLoaded === 'number');
  assert.ok(typeof telemetry.body.totalFailed === 'number');
  assert.ok(typeof telemetry.body.modulesCount === 'number');
  console.log('✓ /brain/stats endpoint returns telemetry JSON');

  const stats = globalBrainLoader.getLoaderStats();
  assert.strictEqual(stats.state, 'UNLOADED');
  assert.strictEqual(stats.activePackage, null);
  assert.strictEqual(stats.modulesCount, 0);
  console.log('✓ Loader stats reflect the unloaded lifecycle state');

  console.log('--- All Brain Package Loader Tests Passed Successfully ---');
} finally {
  unsubLoaded();
  unsubUnloaded();
  unsubFailed();
  server.close();
}
