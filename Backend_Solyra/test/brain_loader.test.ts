import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const validAstProgram = {
  version: '1.0',
  programId: 'rule-ast',
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
        left: { type: 'Identifier', name: 'status' },
        right: { type: 'Literal', value: 'active' },
      },
    },
  ],
};

const deepAstProgram = {
  version: '1.0',
  programId: 'deep-rule-ast',
  maxDepth: 8,
  body: [
    {
      type: 'BinaryExpression',
      operator: 'AND',
      left: {
        type: 'BinaryExpression',
        operator: 'ADD',
        left: {
          type: 'BinaryExpression',
          operator: 'SUBTRACT',
          left: { type: 'Literal', value: 1 },
          right: { type: 'Literal', value: 2 },
        },
        right: {
          type: 'BinaryExpression',
          operator: 'ADD',
          left: { type: 'Literal', value: 3 },
          right: { type: 'Literal', value: 4 },
        },
      },
      right: { type: 'Literal', value: true },
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

  // 5. AST extraction and validation enforces DSL_RULESET compliance and bounded depth
  const astLoader = new (await import('../src/brain/loader.js')).BrainPackageLoader();
  const astManifest: BrainPackageManifest = {
    ...validManifest,
    brainId: 'brain-ast-rules',
    version: '2.0.0',
    runtimeConstraints: {
      ...validManifest.runtimeConstraints,
      boundedAstDepth: 3,
    },
    modules: [
      {
        name: 'rule-ast-module',
        entryPoint: 'dist/rule-ast-module.js',
        sha256: 'b'.repeat(64),
        moduleType: 'DSL_RULESET',
      },
    ],
  };

  const astLoad = astLoader.loadPackage(astManifest);
  assert.strictEqual(astLoad, true);
  const astFailureEvents: Array<{ moduleName: string; errors: string[] }> = [];
  const unsubscribeAstFailure = globalBus.subscribe('brain:ast_validation_failed', (payload: any) => {
    astFailureEvents.push({
      moduleName: payload.moduleName,
      errors: Array.isArray(payload.errors) ? payload.errors.map((entry: any) => typeof entry === 'string' ? entry : entry.message) : [],
    });
  });

  const validAstResult = astLoader.extractAndValidateAst('rule-ast-module', validAstProgram);
  assert.strictEqual(validAstResult.valid, true);
  assert.deepStrictEqual(validAstResult.errors, []);
  console.log('✓ AST extraction validates a compliant DSL_RULESET payload');

  const deepValidation = astLoader.extractAndValidateAst('rule-ast-module', deepAstProgram);
  assert.strictEqual(deepValidation.valid, false);
  assert.ok(deepValidation.errors.length > 0);
  assert.ok(astFailureEvents.some((entry) => entry.moduleName === 'rule-ast-module'));
  console.log('✓ AST extraction enforces bounded depth and emits telemetry');

  const wrongTypeLoader = new (await import('../src/brain/loader.js')).BrainPackageLoader();
  const wrongTypeManifest: BrainPackageManifest = {
    ...astManifest,
    modules: [
      { ...astManifest.modules[0], name: 'binary-module', moduleType: 'INDEX_LOOKUP' },
    ],
  };
  assert.strictEqual(wrongTypeLoader.loadPackage(wrongTypeManifest), true);
  const wrongTypeResult = wrongTypeLoader.extractAndValidateAst('binary-module', validAstProgram);
  assert.strictEqual(wrongTypeResult.valid, false);
  assert.match(wrongTypeResult.errors[0].message ?? '', /not of type DSL_RULESET/);
  console.log('✓ AST extraction rejects non-DSL_RULESET modules');

  const malformedJsonResult = astLoader.extractAndValidateAst('rule-ast-module', '{"version": "1.0"');
  assert.strictEqual(malformedJsonResult.valid, false);
  assert.ok(malformedJsonResult.errors.length > 0);
  assert.ok(astFailureEvents.some((entry) => entry.moduleName === 'rule-ast-module' && entry.errors.some((message) => message.includes('Failed to parse AST JSON'))));
  console.log('✓ AST extraction rejects malformed JSON payloads and emits telemetry');

  const noPackageLoader = new (await import('../src/brain/loader.js')).BrainPackageLoader();
  assert.throws(
    () => noPackageLoader.extractAndValidateAst('rule-ast-module', validAstProgram),
    /Cannot extract and validate AST: No active package loaded/
  );
  console.log('✓ AST extraction throws when no active package is loaded');

  const missingModuleLoader = new (await import('../src/brain/loader.js')).BrainPackageLoader();
  assert.strictEqual(missingModuleLoader.loadPackage(astManifest), true);
  assert.throws(
    () => missingModuleLoader.extractAndValidateAst('missing-module', validAstProgram),
    /Module 'missing-module' not found in active package manifest/
  );
  console.log('✓ AST extraction throws when the target module is absent from the manifest');

  unsubscribeAstFailure();
  assert.strictEqual(astLoader.unloadPackage(), true);
  assert.strictEqual(wrongTypeLoader.unloadPackage(), true);
  assert.strictEqual(missingModuleLoader.unloadPackage(), true);

  // 6. verifyModuleContent verifies module content integrity and emits mismatch telemetry
  const verificationLoader = new (await import('../src/brain/loader.js')).BrainPackageLoader();
  const verificationContent = 'export const handler = () => "ok";';
  const verificationHash = createHash('sha256').update(verificationContent, 'utf8').digest('hex');
  const verificationManifest = {
    schemaVersion: '1.0',
    brainId: 'brain-verify-content',
    version: '1.0.0',
    createdAt: Date.now(),
    runtimeConstraints: {
      maxMemoryBytes: 1024 * 1024,
      maxExecutionTimeMs: 5000,
      boundedAstDepth: 10,
    },
    modules: [
      {
        name: 'main',
        entryPoint: 'dist/main.js',
        sha256: verificationHash,
        moduleType: 'DSL_RULESET',
      },
    ],
  } as BrainPackageManifest;

  const verificationLoad = verificationLoader.loadPackage(verificationManifest);
  assert.strictEqual(verificationLoad, true);
  const verificationResult = verificationLoader.verifyModuleContent('main', verificationContent);
  assert.strictEqual(verificationResult.valid, true);
  assert.strictEqual(verificationResult.error, undefined);

  let mismatchEventSeen = false;
  let mismatchEventPayload: any = null;
  const unsubscribeMismatch = globalBus.subscribe('brain:module_hash_mismatch', (payload: any) => {
    mismatchEventSeen = true;
    mismatchEventPayload = payload;
  });

  const mismatchResult = verificationLoader.verifyModuleContent('main', 'tampered content');
  unsubscribeMismatch();
  assert.strictEqual(mismatchResult.valid, false);
  assert.match(mismatchResult.error ?? '', /Hash mismatch for module main/);
  assert.strictEqual(mismatchEventSeen, true);
  assert.strictEqual(mismatchEventPayload?.brainId, 'brain-verify-content');
  assert.strictEqual(mismatchEventPayload?.moduleName, 'main');

  assert.strictEqual(verificationLoader.unloadPackage(), true);
  assert.throws(
    () => verificationLoader.verifyModuleContent('main', 'some content'),
    /No active package to verify module against/
  );

  const loadedAgain = verificationLoader.loadPackage(verificationManifest);
  assert.strictEqual(loadedAgain, true);
  assert.throws(
    () => verificationLoader.verifyModuleContent('missing-module', 'some content'),
    /Module missing-module not found in active package manifest/
  );
  assert.strictEqual(verificationLoader.unloadPackage(), true);

  console.log('✓ Module content verification validates correct hashes and emits mismatch telemetry');
  console.log('✓ Module content verification rejects missing active package and unknown modules');

  const { BrainPackageLoader } = await import('../src/brain/loader.js');

  const lifecycleManifestV1: BrainPackageManifest = {
    ...validManifest,
    brainId: 'brain-lifecycle',
    version: '1.0.0',
    modules: [
      {
        ...validManifest.modules[0],
        name: 'lifecycle-core',
        sha256: 'a'.repeat(64),
      },
    ],
  };

  const lifecycleManifestV2: BrainPackageManifest = {
    ...lifecycleManifestV1,
    version: '2.0.0',
    modules: [
      {
        ...lifecycleManifestV1.modules[0],
        name: 'lifecycle-core-v2',
        sha256: 'b'.repeat(64),
      },
    ],
  };

  const historyLoader = new BrainPackageLoader();
  assert.strictEqual(historyLoader.loadPackage(lifecycleManifestV1), true);
  assert.strictEqual(historyLoader.loadPackage(lifecycleManifestV2), true);
  assert.strictEqual(historyLoader.getPackageHistory().length, 1);
  assert.strictEqual(historyLoader.getPackageHistory()[0].id, 'brain-lifecycle');
  assert.strictEqual(historyLoader.getActivePackage()?.version, '2.0.0');
  console.log('✓ Sequential loads preserve previous versions in packageHistory');

  const rollbackLoader = new BrainPackageLoader();
  assert.strictEqual(rollbackLoader.loadPackage(lifecycleManifestV1), true);
  assert.strictEqual(rollbackLoader.loadPackage(lifecycleManifestV2), true);
  const rollbackResult = rollbackLoader.rollbackPackage();
  assert.strictEqual(rollbackResult.success, true);
  assert.strictEqual(rollbackResult.rolledBackTo?.version, '1.0.0');
  assert.strictEqual(rollbackLoader.getActivePackage()?.version, '1.0.0');
  console.log('✓ rollbackPackage restores the previous manifest and emits rollback telemetry');

  const emptyRollbackLoader = new BrainPackageLoader();
  const emptyRollback = emptyRollbackLoader.rollbackPackage();
  assert.strictEqual(emptyRollback.success, false);
  assert.match(emptyRollback.error ?? '', /No previous package in history to rollback to/);
  console.log('✓ rollbackPackage fails cleanly when history is empty');

  const activationLoader = new BrainPackageLoader();
  assert.strictEqual(activationLoader.loadPackage(lifecycleManifestV1), true);
  assert.strictEqual(activationLoader.loadPackage(lifecycleManifestV2), true);
  const activated = activationLoader.activatePackage('brain-lifecycle', '1.0.0');
  assert.strictEqual(activated.success, true);
  assert.strictEqual(activationLoader.getActivePackage()?.version, '1.0.0');
  console.log('✓ activatePackage restores a historical version and updates activeManifest');

  const deactivationLoader = new BrainPackageLoader();
  assert.strictEqual(deactivationLoader.loadPackage(lifecycleManifestV1), true);
  const deactivated = deactivationLoader.deactivatePackage();
  assert.strictEqual(deactivated.success, true);
  assert.strictEqual(deactivationLoader.getActivePackage(), null);
  assert.strictEqual(deactivationLoader.getLifecycleState(), 'UNLOADED');
  assert.strictEqual(deactivationLoader.getPackageHistory().length, 1);
  console.log('✓ deactivatePackage clears active package state without purging packageHistory');

  const exportLoader = new BrainPackageLoader();
  assert.strictEqual(exportLoader.loadPackage(lifecycleManifestV2), true);
  const exportResult = exportLoader.exportPackage('brain-lifecycle', '2.0.0');
  assert.strictEqual(exportResult.success, true);
  assert.deepStrictEqual(exportResult.bundle.modules, lifecycleManifestV2.modules);
  assert.notStrictEqual(exportResult.bundle, exportLoader.getActivePackage());
  console.log('✓ exportPackage returns a deep-copied bundle with valid manifest content');

  const lifecycleEvents: Record<string, number> = {};
  const unsubscribeLifecycleTelemetry = globalBus.subscribe('brain:load_initiated', () => {
    lifecycleEvents['brain:load_initiated'] = (lifecycleEvents['brain:load_initiated'] ?? 0) + 1;
  });
  globalBus.subscribe('brain:package_rollback_initiated', () => {
    lifecycleEvents['brain:package_rollback_initiated'] = (lifecycleEvents['brain:package_rollback_initiated'] ?? 0) + 1;
  });
  globalBus.subscribe('brain:package_rollback_completed', () => {
    lifecycleEvents['brain:package_rollback_completed'] = (lifecycleEvents['brain:package_rollback_completed'] ?? 0) + 1;
  });
  globalBus.subscribe('brain:package_activated', () => {
    lifecycleEvents['brain:package_activated'] = (lifecycleEvents['brain:package_activated'] ?? 0) + 1;
  });
  globalBus.subscribe('brain:package_deactivated', () => {
    lifecycleEvents['brain:package_deactivated'] = (lifecycleEvents['brain:package_deactivated'] ?? 0) + 1;
  });
  globalBus.subscribe('brain:package_exported', () => {
    lifecycleEvents['brain:package_exported'] = (lifecycleEvents['brain:package_exported'] ?? 0) + 1;
  });

  const telemetryLoader = new BrainPackageLoader();
  assert.strictEqual(telemetryLoader.loadPackage(lifecycleManifestV1), true);
  assert.strictEqual(telemetryLoader.loadPackage(lifecycleManifestV2), true);
  assert.strictEqual(telemetryLoader.rollbackPackage().success, true);
  assert.strictEqual(telemetryLoader.getActivePackage()?.version, '1.0.0');
  assert.strictEqual(telemetryLoader.loadPackage(lifecycleManifestV2), true);
  assert.strictEqual(telemetryLoader.activatePackage('brain-lifecycle', '1.0.0').success, true);
  assert.strictEqual(telemetryLoader.getActivePackage()?.version, '1.0.0');
  assert.strictEqual(telemetryLoader.deactivatePackage().success, true);
  assert.strictEqual(telemetryLoader.exportPackage('brain-lifecycle', '1.0.0').success, true);
  assert.ok(lifecycleEvents['brain:load_initiated'] >= 1);
  assert.ok(lifecycleEvents['brain:package_rollback_initiated'] >= 1);
  assert.ok(lifecycleEvents['brain:package_rollback_completed'] >= 1);
  assert.ok(lifecycleEvents['brain:package_activated'] >= 1);
  assert.ok(lifecycleEvents['brain:package_deactivated'] >= 1);
  assert.ok(lifecycleEvents['brain:package_exported'] >= 1);
  unsubscribeLifecycleTelemetry();
  console.log('✓ lifecycle telemetry emits rollback, activation, deactivation, export, and load events');

  // 6. Telemetry endpoint returns JSON structure
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
