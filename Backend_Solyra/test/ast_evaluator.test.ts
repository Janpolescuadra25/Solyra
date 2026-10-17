import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SOLYRA_AUTH_TOKEN = 'test-ephemeral-secret-key';

const { server } = await import('../src/index.js');
import { evaluateAstProgram, validateBoundedAstProgram } from '../src/ast/index.js';

const baseProgram = {
  version: '1.0',
  programId: 'exec_001',
  maxDepth: 8,
  body: [] as any[],
};

function makeProgram(body: any[], overrides: Record<string, unknown> = {}): any {
  return {
    version: '1.0',
    programId: 'exec_001',
    maxDepth: 8,
    body,
    ...overrides,
  };
}

function sendJsonRequest(path: string, payload: unknown): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: (server.address() as { port: number }).port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SOLYRA_AUTH_TOKEN ?? ''}`,
        },
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => {
          raw += chunk.toString();
        });
        response.on('end', () => {
          try {
            resolve({ statusCode: response.statusCode ?? 500, body: JSON.parse(raw || '{}') });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on('error', reject);
    request.write(JSON.stringify(payload));
    request.end();
  });
}

console.log('--- Running AST Execution Engine Test Suite ---');

const arithmeticProgram = makeProgram([
  {
    type: 'AssignmentStatement',
    target: 'total',
    value: {
      type: 'BinaryExpression',
      operator: 'ADD',
      left: { type: 'Literal', value: 2 },
      right: { type: 'Literal', value: 3 },
    },
  },
  {
    type: 'ReturnStatement',
    value: { type: 'Identifier', name: 'total' },
  },
]);

const arithmeticResult = evaluateAstProgram(arithmeticProgram, {}, { maxSteps: 1000, timeoutMs: 1000 });
assert.equal(arithmeticResult.success, true, 'Basic arithmetic assignment should succeed');
assert.equal(arithmeticResult.result, 5);
console.log('✓ Arithmetic assignment and return evaluation works');

const unaryProgram = makeProgram([
  {
    type: 'UnaryExpression',
    operator: 'NEGATE',
    argument: { type: 'Literal', value: 7 },
  },
] as any);

const unaryResult = evaluateAstProgram(unaryProgram, {}, { maxSteps: 1000, timeoutMs: 1000 });
assert.equal(unaryResult.success, true);
assert.equal(unaryResult.result, -7);
console.log('✓ Unary NEGATE and math evaluation works');

const conditionalProgram = makeProgram([
  {
    type: 'IfStatement',
    condition: {
      type: 'BinaryExpression',
      operator: 'GREATER_THAN',
      left: { type: 'Literal', value: 9 },
      right: { type: 'Literal', value: 5 },
    },
    consequent: [
      {
        type: 'AssignmentStatement',
        target: 'branchValue',
        value: { type: 'Literal', value: 'yes' },
      },
    ],
    alternate: [
      {
        type: 'AssignmentStatement',
        target: 'branchValue',
        value: { type: 'Literal', value: 'no' },
      },
    ],
  },
  {
    type: 'ReturnStatement',
    value: { type: 'Identifier', name: 'branchValue' },
  },
]);

const conditionalResult = evaluateAstProgram(conditionalProgram, {}, { maxSteps: 1000, timeoutMs: 1000 });
assert.equal(conditionalResult.success, true);
assert.equal(conditionalResult.result, 'yes');
console.log('✓ Conditional branch evaluation works');

const safeCallProgram = makeProgram([
  {
    type: 'AssignmentStatement',
    target: 'result',
    value: {
      type: 'CallExpression',
      callee: 'Math.max',
      arguments: [
        { type: 'Literal', value: 4 },
        { type: 'Literal', value: 9 },
        { type: 'Literal', value: 2 },
      ],
    },
  },
  {
    type: 'ReturnStatement',
    value: { type: 'Identifier', name: 'result' },
  },
]);

const safeCallResult = evaluateAstProgram(safeCallProgram, {}, { maxSteps: 1000, timeoutMs: 1000 });
assert.equal(safeCallResult.success, true);
assert.equal(safeCallResult.result, 9);
console.log('✓ Safe whitelist function calls succeed');

const emitProgram = makeProgram([
  {
    type: 'EmitEventStatement',
    eventName: 'demo.event',
    payload: {
      value: {
        type: 'BinaryExpression',
        operator: 'ADD',
        left: { type: 'Literal', value: 7 },
        right: { type: 'Literal', value: 3 },
      },
    },
  },
  {
    type: 'ReturnStatement',
    value: { type: 'Literal', value: true },
  },
]);

const emitResult = evaluateAstProgram(emitProgram, {}, {
  maxSteps: 1000,
  timeoutMs: 1000,
  onEmitEvent: (_eventName, payload) => {
    assert.equal(payload.value, 10);
  },
});
assert.equal(emitResult.success, true);
assert.equal(emitResult.emittedEvents[0]?.eventName, 'demo.event');
assert.equal(emitResult.emittedEvents[0]?.payload.value, 10);
console.log('✓ Event emission captures payload data');

const invalidIdentifier = validateBoundedAstProgram(makeProgram([
  { type: 'Identifier', name: '__proto__' },
]));
assert.equal(invalidIdentifier.valid, false);
assert.ok(invalidIdentifier.errors.some((error) => error.code === 'INVALID_IDENTIFIER'));
console.log('✓ Prototype identifiers are rejected by validator');

const invalidAssignment = validateBoundedAstProgram(makeProgram([
  {
    type: 'AssignmentStatement',
    target: 'constructor',
    value: { type: 'Literal', value: 1 },
  },
]));
assert.equal(invalidAssignment.valid, false);
assert.ok(invalidAssignment.errors.some((error) => error.code === 'INVALID_ASSIGNMENT_TARGET'));
console.log('✓ Prototype assignment targets are rejected');

const invalidCall = validateBoundedAstProgram(makeProgram([
  {
    type: 'CallExpression',
    callee: 'process.exit',
    arguments: [{ type: 'Literal', value: 1 }],
  },
]));
assert.equal(invalidCall.valid, false);
assert.ok(invalidCall.errors.some((error) => error.code === 'UNAUTHORIZED_CALL'));
console.log('✓ Unauthorized callees are rejected');

const overflowProgram = makeProgram(Array.from({ length: 1200 }, () => ({
  type: 'AssignmentStatement',
  target: 'x',
  value: { type: 'Literal', value: 1 },
})));
const overflowResult = evaluateAstProgram(overflowProgram, {}, { maxSteps: 10 });
assert.equal(overflowResult.success, false);
assert.match(overflowResult.error ?? '', /step limit/i);
console.log('✓ Step limit enforcement rejects long execution loops');

const divisionByZeroProgram = makeProgram([
  {
    type: 'BinaryExpression',
    operator: 'DIVIDE',
    left: { type: 'Literal', value: 5 },
    right: { type: 'Literal', value: 0 },
  },
]);
const divisionByZero = evaluateAstProgram(divisionByZeroProgram, {}, { maxSteps: 1000, timeoutMs: 1000 });
assert.equal(divisionByZero.success, false);
assert.equal(divisionByZero.diagnostic?.code, 'DIVISION_BY_ZERO');
assert.ok(divisionByZero.diagnostic?.path);
assert.match(divisionByZero.error ?? '', /Division by zero|Unsupported binary operator/i);
console.log('✓ Division by zero is rejected gracefully');

const stepBudgetProgram = makeProgram(Array.from({ length: 1200 }, () => ({
  type: 'AssignmentStatement',
  target: 'x',
  value: { type: 'Literal', value: 1 },
})));
const stepBudgetResult = evaluateAstProgram(stepBudgetProgram, {}, { maxSteps: 10, timeoutMs: 1000 });
assert.equal(stepBudgetResult.success, false);
assert.equal(stepBudgetResult.diagnostic?.code, 'STEP_BUDGET_EXCEEDED');
assert.equal(stepBudgetResult.diagnostic?.step, 10);
assert.ok(stepBudgetResult.diagnostic?.path);
console.log('✓ STEP_BUDGET_EXCEEDED diagnostic is returned with traversal path');

const port = await new Promise<number>((resolve, reject) => {
  server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
  server.once('error', reject);
});

try {
  const validExecution = await sendJsonRequest('/ast/execute', {
    program: arithmeticProgram,
    context: { score: 42 },
  });
  assert.equal(validExecution.statusCode, 200);
  assert.equal(validExecution.body.success, true);
  assert.equal(validExecution.body.execution.result, 5);
  console.log('✓ POST /ast/execute accepts valid AST payloads');

  const invalidExecution = await sendJsonRequest('/ast/execute', {
    program: {
      version: '1.0',
      programId: 'invalid_exec',
      maxDepth: 3,
      body: [{ type: 'Identifier', name: '__proto__' }],
    },
  });
  assert.equal(invalidExecution.statusCode, 422);
  assert.equal(invalidExecution.body.success, false);
  console.log('✓ POST /ast/execute rejects invalid AST before execution');

  const inspectResponse = await sendJsonRequest('/ast/workbench/inspect', { program: arithmeticProgram });
  assert.equal(inspectResponse.statusCode, 200);
  assert.equal(inspectResponse.body.success, true);
  console.log('✓ POST /ast/workbench/inspect reports validation and execution stats');
} finally {
  server.close();
}

console.log('--- All AST Execution Engine Tests Passed Successfully ---');
