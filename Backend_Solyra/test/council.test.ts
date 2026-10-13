import assert from 'node:assert/strict';

import { CouncilMemberRole } from '@solyra/shared';
import { NeuroBus } from '../src/neurobus/neurobus.js';
import { CouncilEngine } from '../src/council/engine.js';
import { globalCouncil } from '../src/council/index.js';

console.log('--- Running Council Consensus Engine Test Suite ---');

const bus = new NeuroBus({ capacity: 1000 });
const engine = new CouncilEngine(bus);

const startedEvents: unknown[] = [];
const concludedEvents: unknown[] = [];
const unsubscribeStarted = bus.subscribe('council:deliberation:started', ((payload: unknown) => {
  startedEvents.push(payload);
}) as any);
const unsubscribeConcluded = bus.subscribe('council:deliberation:concluded', ((payload: unknown) => {
  concludedEvents.push(payload);
}) as any);

try {
  // 1. Verify 7 registered members
  const members = engine.getMembers();
  assert.strictEqual(members.length, 7, 'Council must register exactly 7 members');
  assert.ok(members.includes(CouncilMemberRole.REX), 'REX must be registered');
  assert.ok(members.includes(CouncilMemberRole.VAL), 'VAL must be registered');
  assert.ok(members.includes(CouncilMemberRole.LIA), 'LIA must be registered');
  console.log('✓ 7 Council members registered correctly');

  // 2. Proposal creation and majority approval
  const p1 = engine.createDeliberationProposal(
    'prop-1',
    'Adopt Neural Cache Policy',
    'Increase cache TTL for query embedding',
    CouncilMemberRole.YOSHI,
  );
  assert.strictEqual(p1.status, 'PENDING');
  assert.strictEqual(startedEvents.length, 1, 'Proposal start event should emit once');

  engine.castVote('prop-1', CouncilMemberRole.YOSHI, true);
  engine.castVote('prop-1', CouncilMemberRole.ASH, true);
  engine.castVote('prop-1', CouncilMemberRole.BEN, true);
  engine.castVote('prop-1', CouncilMemberRole.CHA, true);
  engine.castVote('prop-1', CouncilMemberRole.LIA, false);

  const r1 = engine.concludeDeliberation('prop-1');
  assert.strictEqual(r1.approved, true, '4 of 7 approvals must pass proposal');
  assert.strictEqual(r1.voteTally.approve, 4);
  assert.strictEqual(r1.voteTally.reject, 1);
  assert.strictEqual(r1.vetoedBy, undefined);
  console.log('✓ Majority approval works correctly');

  // 3. Security Veto by REX
  const p2 = engine.createDeliberationProposal(
    'prop-2',
    'Expose Internal State RPC',
    'Direct access endpoint without token validation',
    CouncilMemberRole.BEN,
  );
  assert.ok(p2.id === 'prop-2');

  engine.castVote('prop-2', CouncilMemberRole.YOSHI, true);
  engine.castVote('prop-2', CouncilMemberRole.ASH, true);
  engine.castVote('prop-2', CouncilMemberRole.BEN, true);
  engine.castVote('prop-2', CouncilMemberRole.CHA, true);
  engine.castVote('prop-2', CouncilMemberRole.VAL, true);
  engine.castVote('prop-2', CouncilMemberRole.REX, false, 'Security violation: unauthenticated RPC', true);

  const r2 = engine.concludeDeliberation('prop-2');
  assert.strictEqual(r2.approved, false, 'REX veto must reject proposal despite 5 approvals');
  assert.strictEqual(r2.vetoedBy, CouncilMemberRole.REX);
  console.log('✓ REX security veto strictly enforced');

  // 4. Correctness Veto by VAL
  const p3 = engine.createDeliberationProposal(
    'prop-3',
    'Compress Vector Graph',
    'Lossy quantization with high reconstruction error',
    CouncilMemberRole.CHA,
  );

  engine.castVote('prop-3', CouncilMemberRole.YOSHI, true);
  engine.castVote('prop-3', CouncilMemberRole.ASH, true);
  engine.castVote('prop-3', CouncilMemberRole.BEN, true);
  engine.castVote('prop-3', CouncilMemberRole.CHA, true);
  engine.castVote('prop-3', CouncilMemberRole.VAL, false, 'Evaluation failure: precision drop exceeds threshold', true);

  const r3 = engine.concludeDeliberation('prop-3');
  assert.strictEqual(r3.approved, false, 'VAL veto must reject proposal');
  assert.strictEqual(r3.vetoedBy, CouncilMemberRole.VAL);
  console.log('✓ VAL correctness veto strictly enforced');

  // 5. Input validation: invalid member role / duplicate vote
  const p4 = engine.createDeliberationProposal(
    'prop-4',
    'Branch Protection Gate',
    'Require mandatory code review for all critical changes',
    CouncilMemberRole.CHA,
  );

  engine.castVote('prop-4', CouncilMemberRole.YOSHI, true);
  assert.throws(() => {
    engine.castVote('prop-4', 'UNKNOWN_ROLE' as any, true);
  }, /Invalid council member role/);
  assert.throws(() => {
    engine.castVote('prop-4', CouncilMemberRole.YOSHI, false);
  }, /already voted/i);

  engine.castVote('prop-4', CouncilMemberRole.ASH, true);
  engine.castVote('prop-4', CouncilMemberRole.BEN, true);
  engine.castVote('prop-4', CouncilMemberRole.CHA, true);
  engine.castVote('prop-4', CouncilMemberRole.LIA, true);
  const r4 = engine.concludeDeliberation('prop-4');
  assert.strictEqual(r4.approved, true, 'prop-4 should pass with 5 approvals');
  console.log('✓ Runtime validation prevents invalid member votes and duplicates');

  // 6. Telemetry stats tracking
  const stats = engine.getCouncilStats();
  assert.strictEqual(stats.totalDeliberations, 4, 'Total deliberations should be recorded');
  assert.strictEqual(stats.approvedCount, 2, 'Two majority approvals should be recorded');
  assert.strictEqual(stats.rejectedCount, 2, 'Two rejections should be counted');
  assert.strictEqual(stats.vetoedCount, 2, 'Two vetoes should be tracked');
  assert.strictEqual(stats.activeDeliberations, 0, 'No active proposals should remain after resolution');

  const globalStats = globalCouncil.getCouncilStats();
  assert.ok(typeof globalStats.totalDeliberations === 'number');
  console.log('✓ Telemetry metrics track deliberations and vetoes correctly');

  assert.ok(concludedEvents.length >= 3, 'Deliberation completion events should emit');
  console.log('--- All Council Tests Passed Successfully ---');
} finally {
  unsubscribeStarted();
  unsubscribeConcluded();
}
