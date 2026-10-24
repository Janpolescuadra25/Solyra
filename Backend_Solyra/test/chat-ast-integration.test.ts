import assert from 'node:assert/strict';
import { ArousalLevel, SystemPriority } from '@solyra/shared';
import { compileChatPromptToAst } from '../src/ast/chat-compiler.js';
import { evaluateAstProgram } from '../src/ast/evaluator.js';
import { globalThalamus } from '../src/thalamus/router.js';

async function runTests(): Promise<void> {
  console.log('--- START CHAT AST INTEGRATION SUITE ---');

  globalThalamus.registerRoute('chat.*', SystemPriority.USER, ArousalLevel.ALERT);
  const routeResult = globalThalamus.routeInput({
    channel: 'chat.user',
    source: 'qa-agent',
    payload: { test: true },
  });

  assert.equal(routeResult.decision.accepted, true);
  console.log('✓ Test 1 Passed: chat.* route accepted a user message');

  const prompt = 'Hello Solyra!';
  const program = compileChatPromptToAst(prompt, { conversationId: 'chat-1', userId: 'user-1' });
  assert.equal(program.version, '1.0');
  assert.match(program.programId, /^chat-ast-/);
  assert.ok(program.body.length > 0);
  assert.ok(program.maxDepth <= 5);

  const evaluation = evaluateAstProgram(program, { user: { id: 'user-1' }, timestamp: Date.now() });
  assert.equal(evaluation.success, true);
  assert.equal(typeof evaluation.result, 'string');
  assert.ok(String(evaluation.result).includes('Greetings') || String(evaluation.result).includes('SOL'));
  assert.ok(evaluation.stepsExecuted > 0);
  assert.ok(evaluation.events.some((event) => event.eventName === 'chat.reasoning'));
  console.log('✓ Test 2 Passed: compiler emitted a valid AST and evaluation succeeded');

  const statusProgram = compileChatPromptToAst('What is the system status?', { conversationId: 'chat-2', userId: 'user-1' });
  const statusResult = evaluateAstProgram(statusProgram);
  assert.equal(statusResult.success, true);
  assert.ok(String(statusResult.result).includes('SOL System Status'));
  console.log('✓ Test 3 Passed: system-status prompt compiled to the expected response');

  const generalProgram = compileChatPromptToAst('Analyze cognitive memory alignment.', { conversationId: 'chat-3', userId: 'user-1' });
  const generalResult = evaluateAstProgram(generalProgram);
  assert.equal(generalResult.success, true);
  assert.ok(String(generalResult.result).includes('SOL Reasoning Engine'));
  console.log('✓ Test 4 Passed: general prompts evaluated deterministically');

  console.log('=== ALL CHAT AST INTEGRATION TESTS PASSED ===');
}

runTests().catch((error: unknown) => {
  console.error('CHAT AST INTEGRATION SUITE FAILED:', error);
  process.exit(1);
});
