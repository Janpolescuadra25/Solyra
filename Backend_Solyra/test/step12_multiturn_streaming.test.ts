import assert from 'node:assert/strict';

import { CouncilMemberRole } from '@solyra/shared';
import { compileChatPromptToAst } from '../src/ast/chat-compiler.js';
import { evaluateAstProgram, evaluateStreamingAstProgram } from '../src/ast/evaluator.js';
import { CouncilEngine } from '../src/council/engine.js';

const structuredProgram = compileChatPromptToAst('Propose a council policy update', {
  history: [
    { role: 'user', content: 'turn 1' },
    { role: 'assistant', content: 'turn 2' },
  ],
});
const structuredEvaluation = evaluateAstProgram(structuredProgram, { userId: 'user-1' });
const structuredReasoning = structuredEvaluation.events.find((event) => event.eventName === 'chat.reasoning');
assert.ok(structuredReasoning, 'Structured history should emit a chat.reasoning event');
assert.equal(structuredReasoning?.payload?.historyTurns, 2, 'Structured history should normalize to two turns');

const legacyProgram = compileChatPromptToAst('Deliberate the policy decision', {
  history: ['turn 1', 'turn 2', 'turn 3'],
});
const legacyEvaluation = evaluateAstProgram(legacyProgram, { userId: 'user-2' });
const legacyReasoning = legacyEvaluation.events.find((event) => event.eventName === 'chat.reasoning');
assert.ok(legacyReasoning, 'Legacy history should emit a chat.reasoning event');
assert.equal(legacyReasoning?.payload?.historyTurns, 3, 'Legacy string history should normalize to three turns');

const councilEngine = new CouncilEngine();
const proposal = councilEngine.createDeliberationProposal(
  'step12-proposal-1',
  'Test governance proposal',
  'Validate the ORACLE-driven route',
  CouncilMemberRole.ORACLE,
);
assert.equal(proposal.initiator, CouncilMemberRole.ORACLE, 'Proposal initiator must be ORACLE');

const streamedEvents: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
const streamProgram = compileChatPromptToAst('Governance review required for policy approval', {
  history: ['prior context'],
});

await evaluateStreamingAstProgram(
  streamProgram,
  { userId: 'stream-user' },
  {
    maxSteps: 1000,
    timeoutMs: 30000,
    onEmitEvent: (eventName, payload) => {
      streamedEvents.push({ eventName, payload });
    },
  },
);

assert.ok(streamedEvents.length > 0, 'Streaming evaluation should emit events');
assert.equal(streamedEvents[0]?.eventName, 'chat.reasoning', 'First emitted event should be chat.reasoning');

console.log('STEP 12 MULTITURN STREAMING TESTS PASSED');
