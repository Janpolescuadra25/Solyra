import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SOLYRA_AUTH_TOKEN = 'test-ephemeral-secret-key';

const { server } = await import('../src/index.js');
import { globalBus } from '../src/neurobus/index.js';
import { globalBrainLoader } from '../src/brain/index.js';
import type { BrainPackageManifest } from '../src/brain/loader.js';

console.log('--- Running Brain Sandbox Test Suite ---');

const authToken = process.env.SOLYRA_AUTH_TOKEN ?? 'test-ephemeral-secret-key';

const makeRuleProgram = (body: unknown) => ({
  version: '1.0',
  programId: 'sandbox-rule',
  body,
});

const validExecutionProgram = makeRuleProgram([
  {
    type: 'ReturnStatement',
    value: { type: 'Literal', value: 42 },
  },
]);

const stepLimitProgram = makeRuleProgram(
  Array.from({ length: 20 }, (_, index) => ({
    type: 'AssignmentStatement',
    target: `value_${index}`,
    value: { type: 'Literal', value: index },
  })),
);

const timeoutProgram = makeRuleProgram(
  Array.from({ length: 120 }, (_, index) => ({
    type: 'AssignmentStatement',
    target: `loop_${index}`,
    value: { type: 'Literal', value: index },
  })),
);

function createManifest(overrides: Partial<BrainPackageManifest> = {}): BrainPackageManifest {
  const base: BrainPackageManifest = {
    schemaVersion: '1.0',
    brainId: 'brain-sandbox-test',
    version: '1.0.0',
    createdAt: Date.now(),
    runtimeConstraints: {
      maxMemoryBytes: 1024 * 1024,
      maxExecutionTimeMs: 100,
      boundedAstDepth: 12,
      maxSteps: 100,
    },
    modules: [
      {
        name: 'rule-module',
        entryPoint: 'dist/rule-module.js',
        sha256: 'a'.repeat(64),
        moduleType: 'DSL_RULESET',
        payload: validExecutionProgram,
      },
    ],
  };

  return {
    ...base,
    ...overrides,
    runtimeConstraints: {
      ...base.runtimeConstraints,
      ...(overrides.runtimeConstraints ?? {}),
    },
    modules: overrides.modules ?? base.modules,
  };
}

async function requestBrainExecute(payload: Record<string, unknown>, withAuth: boolean): Promise<{ statusCode: number; body: any }> {
  return await new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address !== 'object') {
      reject(new Error('Server address unavailable'));
      return;
    }

    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: '/brain/execute',
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

async function runTests(): Promise<void> {
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
  }

  globalBrainLoader.unloadPackage();

  const validManifest = createManifest();
  const validValidation = globalBrainLoader.validateManifest(validManifest);
  assert.equal(validValidation.valid, true);
  assert.equal(globalBrainLoader.validateManifest({ ...validManifest, runtimeConstraints: { ...validManifest.runtimeConstraints, maxSteps: 0 } }).valid, false);
  assert.equal(globalBrainLoader.validateManifest({ ...validManifest, runtimeConstraints: { ...validManifest.runtimeConstraints, maxSteps: 1.5 } }).valid, false);
  console.log('✓ validateManifest accepts valid maxSteps and rejects invalid values');

  await assert.rejects(
    async () => globalBrainLoader.executeModuleAst('rule-module', {}),
    /No active brain package loaded/
  );
  console.log('✓ executeModuleAst throws when no active package is loaded');

  const executionEvents: any[] = [];
  const executionUnsubscribe = globalBus.subscribe('brain:execution_completed', (payload: any) => {
    executionEvents.push(payload);
  });

  const loaderLoadResult = globalBrainLoader.loadPackage(validManifest);
  assert.equal(loaderLoadResult, true);

  const executionResult = await globalBrainLoader.executeModuleAst('rule-module', { mode: 'safe' }, { trace: 'unit' });
  assert.equal(executionResult.success, true);
  assert.equal(executionResult.result, 42);
  assert.ok(executionResult.metrics.executionTimeMs >= 0);
  assert.ok(executionResult.metrics.stepsExecuted > 0);
  assert.ok(executionEvents.some((event) => event.moduleId === 'rule-module'));
  console.log('✓ executeModuleAst executes valid AST within limits and emits completion telemetry');
  executionUnsubscribe();

  const violationEvents: any[] = [];
  const violationUnsubscribe = globalBus.subscribe('brain:sandbox_violation', (payload: any) => {
    violationEvents.push(payload);
  });

  const stepViolationManifest = createManifest({
    brainId: 'brain-step-violation',
    version: '1.1.0',
    runtimeConstraints: {
      ...validManifest.runtimeConstraints,
      maxSteps: 1,
      maxExecutionTimeMs: 100,
    },
    modules: [
      {
        name: 'step-module',
        entryPoint: 'dist/step-module.js',
        sha256: 'b'.repeat(64),
        moduleType: 'DSL_RULESET',
        payload: stepLimitProgram,
      },
    ],
  });

  globalBrainLoader.unloadPackage();
  assert.equal(globalBrainLoader.loadPackage(stepViolationManifest), true);
  const stepResult = await globalBrainLoader.executeModuleAst('step-module', {});
  assert.equal(stepResult.success, false);
  assert.match(stepResult.error ?? '', /limit|exceeded/i);
  assert.ok(violationEvents.some((event) => event.moduleId === 'step-module'));
  console.log('✓ executeModuleAst catches step budget violations and emits sandbox telemetry');

  const timeoutManifest = createManifest({
    brainId: 'brain-timeout',
    version: '1.2.0',
    runtimeConstraints: {
      ...validManifest.runtimeConstraints,
      maxExecutionTimeMs: 1,
      maxSteps: 200000,
    },
    modules: [
      {
        name: 'timeout-module',
        entryPoint: 'dist/timeout-module.js',
        sha256: 'c'.repeat(64),
        moduleType: 'DSL_RULESET',
        payload: timeoutProgram,
      },
    ],
  });

  globalBrainLoader.unloadPackage();
  assert.equal(globalBrainLoader.loadPackage(timeoutManifest), true);

  const originalNow = Date.now;
  let nowCalls = 0;
  Date.now = () => {
    nowCalls += 1;
    return originalNow() + (nowCalls > 1 ? 10_000 : 0);
  };

  try {
    const timeoutResult = await globalBrainLoader.executeModuleAst('timeout-module', {});
    assert.equal(timeoutResult.success, false);
    assert.match(timeoutResult.error ?? '', /timeout|exceeded/i);
    assert.ok(violationEvents.some((event) => event.moduleId === 'timeout-module'));
  } finally {
    Date.now = originalNow;
  }

  console.log('✓ executeModuleAst catches timeout violations and emits sandbox telemetry');
  violationUnsubscribe();

  globalBrainLoader.unloadPackage();

  const unauthenticatedResponse = await requestBrainExecute({ moduleId: 'rule-module' }, false);
  assert.equal(unauthenticatedResponse.statusCode, 401);
  console.log('✓ POST /brain/execute rejects unauthenticated requests with 401');

  const missingPackageResponse = await requestBrainExecute({ moduleId: 'rule-module' }, true);
  assert.equal(missingPackageResponse.statusCode, 400);
  assert.match(String(missingPackageResponse.body.error ?? ''), /No active brain package loaded/i);
  console.log('✓ POST /brain/execute returns 400 when no package is loaded');

  assert.equal(globalBrainLoader.loadPackage(validManifest), true);

  const missingModuleIdResponse = await requestBrainExecute({}, true);
  assert.equal(missingModuleIdResponse.statusCode, 400);
  assert.match(String(missingModuleIdResponse.body.error ?? ''), /moduleId is required/i);
  console.log('✓ POST /brain/execute returns 400 when moduleId is missing');

  const executionResponse = await requestBrainExecute({ moduleId: 'rule-module', input: { mode: 'safe' }, contextOverrides: { trace: 'route' } }, true);
  assert.equal(executionResponse.statusCode, 200);
  assert.equal(executionResponse.body.success, true);
  assert.equal(executionResponse.body.result, 42);
  assert.ok(executionResponse.body.metrics);
  console.log('✓ POST /brain/execute returns 200 with result and metrics on valid execution');

  globalBrainLoader.unloadPackage();
  assert.equal(globalBrainLoader.loadPackage(stepViolationManifest), true);

  const sandboxRouteResponse = await requestBrainExecute({ moduleId: 'step-module' }, true);
  assert.equal(sandboxRouteResponse.statusCode, 422);
  assert.equal(sandboxRouteResponse.body.success, false);
  assert.ok(sandboxRouteResponse.body.error);
  console.log('✓ POST /brain/execute returns 422 when sandbox limit is exceeded');

  globalBrainLoader.unloadPackage();
  console.log('--- All Brain Sandbox Tests Passed Successfully ---');
}

runTests().catch((error: unknown) => {
  console.error('Brain sandbox verification failed:', error);
  process.exit(1);
}).finally(() => {
  if (server.listening) {
    server.close();
  }
});
