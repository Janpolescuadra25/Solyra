import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';

const { server } = await import('../src/index.js');
import { globalBus } from '../src/neurobus/index.js';
import { canonicalizeJson, hashCanonicalAst, validateBoundedAstProgram } from '../src/ast/index.js';
import type { BoundedAstProgram } from '@solyra/shared';

console.log('--- Running AST Validator & Canonical Serializer Test Suite ---');

function makeProgram(overrides: Partial<BoundedAstProgram> = {}): BoundedAstProgram {
  return {
    version: '1.0',
    programId: 'program_001',
    maxDepth: 4,
    body: [
      {
        type: 'ReturnStatement',
        value: {
          type: 'BinaryExpression',
          operator: 'ADD',
          left: { type: 'Literal', value: 2 },
          right: { type: 'Literal', value: 3 },
        },
      },
    ],
    ...overrides,
  };
}

const validProgram = makeProgram({
  programId: 'complex_ast_001',
  body: [
    {
      type: 'IfStatement',
      condition: {
        type: 'BinaryExpression',
        operator: 'GREATER_THAN',
        left: { type: 'Literal', value: 3 },
        right: { type: 'Literal', value: 2 },
      },
      consequent: [
        {
          type: 'ReturnStatement',
          value: { type: 'Literal', value: true },
        },
      ],
      alternate: [
        {
          type: 'EmitEventStatement',
          eventName: 'debug.event',
          payload: {
            output: {
              type: 'Identifier',
              name: 'result',
            },
          },
        },
      ],
    },
  ],
});

const validation = validateBoundedAstProgram(validProgram);
assert.strictEqual(validation.valid, true, 'Complex valid AST should validate');
assert.match(validation.rootHash ?? '', /^[a-f0-9]{64}$/);
console.log('✓ Valid minimal and complex AST programs validate successfully');

const tooDeep = makeProgram({
  maxDepth: 1,
  body: [
    {
      type: 'ReturnStatement',
      value: {
        type: 'BinaryExpression',
        operator: 'AND',
        left: {
          type: 'BinaryExpression',
          operator: 'OR',
          left: { type: 'Literal', value: true },
          right: { type: 'Literal', value: false },
        },
        right: { type: 'Literal', value: true },
      },
    },
  ],
});
const deepResult = validateBoundedAstProgram(tooDeep);
assert.strictEqual(deepResult.valid, false);
assert.ok(deepResult.errors.some((error) => error.code === 'MAX_DEPTH_EXCEEDED'));
console.log('✓ Programs exceeding maxDepth are rejected');

const invalidOperatorProgram = makeProgram({
  body: [
    {
      type: 'ReturnStatement',
      value: {
        type: 'BinaryExpression',
        operator: '+' as any,
        left: { type: 'Literal', value: 1 },
        right: { type: 'Literal', value: 2 },
      },
    },
  ],
});
const invalidOperatorResult = validateBoundedAstProgram(invalidOperatorProgram);
assert.strictEqual(invalidOperatorResult.valid, false);
assert.ok(invalidOperatorResult.errors.some((error) => error.code === 'INVALID_OPERATOR'));
console.log('✓ Invalid operators are rejected');

const invalidProgramIdResult = validateBoundedAstProgram(makeProgram({ programId: 'bad id!' }));
assert.strictEqual(invalidProgramIdResult.valid, false);
assert.ok(invalidProgramIdResult.errors.some((error) => error.code === 'INVALID_PROGRAM_ID'));
console.log('✓ Invalid programId values are rejected');

const unknownNodeResult = validateBoundedAstProgram({
  version: '1.0',
  programId: 'unknown_node',
  maxDepth: 3,
  body: [{ type: 'UnknownNode' } as any],
});
assert.strictEqual(unknownNodeResult.valid, false);
assert.ok(unknownNodeResult.errors.some((error) => error.code === 'INVALID_NODE_TYPE'));
console.log('✓ Unknown node types are rejected');

const objA = { z: 1, a: { y: 2, x: 1 } };
const objB = { a: { x: 1, y: 2 }, z: 1 };
assert.strictEqual(canonicalizeJson(objA), canonicalizeJson(objB));
const programA = makeProgram({
  programId: 'canon_same',
  body: [{ type: 'ReturnStatement', value: { type: 'Literal', value: true } }],
});
const programB = {
  body: [{ type: 'ReturnStatement', value: { type: 'Literal', value: true } }],
  maxDepth: 4,
  programId: 'canon_same',
  version: '1.0',
} as BoundedAstProgram;
assert.strictEqual(hashCanonicalAst(programA), hashCanonicalAst(programB));
console.log('✓ Canonical serialization is deterministic across key ordering');

const eventPayloads: unknown[] = [];
const unsubscribe = globalBus.subscribe('ast:validated', (payload: unknown) => {
  eventPayloads.push(payload);
});

try {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const port = (server.address() as { port: number }).port;
  const validateResp = await new Promise<{ statusCode: number; body: any }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/ast/validate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode ?? 500, body: JSON.parse(raw || '{}') });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    req.write(JSON.stringify({ program: validProgram }));
    req.end();
  });

  assert.strictEqual(validateResp.statusCode, 200);
  assert.strictEqual(validateResp.body.success, true);
  assert.strictEqual(validateResp.body.valid, true);
  assert.match(validateResp.body.rootHash ?? '', /^[a-f0-9]{64}$/);
  assert.ok(eventPayloads.length >= 1);
  console.log('✓ POST /ast/validate endpoint returns valid JSON and emits validation telemetry');

  const statsResp = await new Promise<{ statusCode: number; body: any }>((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/ast/stats' }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk.toString();
      });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode ?? 500, body: JSON.parse(raw || '{}') });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
  });

  assert.strictEqual(statsResp.statusCode, 200);
  assert.strictEqual(statsResp.body.success, true);
  assert.ok(typeof statsResp.body.stats.validationsCount === 'number');
  console.log('✓ GET /ast/stats endpoint returns telemetry data');
} finally {
  unsubscribe();
  server.close();
}

console.log('--- All AST Tests Passed Successfully ---');
