import { Brainstem } from '../src/brainstem/brainstem.js';
import { HomeostasisMonitor } from '../src/homeostasis/monitor.js';
import { ThalamusRouter } from '../src/thalamus/router.js';
import { globalBus, type PublishResult } from '../src/neurobus/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log('=== Running Phase 2 Step 2 Subsystems Verification ===');

  process.env.NODE_ENV = 'test';
  const runtime = await import('../src/index.js');
  const { startQueueConsumer, stopQueueConsumer } = runtime;

  globalBus.reset();
  const brainstem = new Brainstem(100);

  let heartbeatReceived = false;
  globalBus.subscribe('system.heartbeat', () => {
    heartbeatReceived = true;
  });

  const state = await brainstem.boot();
  assert(state === 'ONLINE', 'Brainstem booted to ONLINE');
  assert(brainstem.getState() === 'ONLINE', 'Brainstem reports ONLINE state');

  await new Promise((resolve) => setTimeout(resolve, 150));
  await globalBus.drain(10);
  assert(heartbeatReceived === true, 'Heartbeat SURVIVAL frame dispatched to NeuroBus');
  assert(brainstem.checkWatchdogLiveness(), 'Watchdog liveness verified');

  const homeostasis = new HomeostasisMonitor();
  const telemetry = homeostasis.sampleTelemetry();
  assert(['sleep', 'drowsy', 'alert', 'hyperaroused'].includes(telemetry.arousal.level), 'Arousal state within canonical bounds');
  assert(telemetry.memory.heapUsedBytes > 0, 'Memory telemetry captured valid heap usage');

  const thalamus = new ThalamusRouter();
  const routeResult = thalamus.routeInput({
    channel: 'user.query',
    source: 'test-client',
    payload: { query: 'hello Sol' },
  });
  assert(routeResult.decision.accepted === true, 'Thalamus accepted user query input');
  assert(routeResult.decision.assignedPriority === 'USER', 'Thalamus assigned USER priority');

  let shutdownTriggered = false;
  globalBus.subscribe('system.shutdown', () => {
    shutdownTriggered = true;
  });

  const finalState = await brainstem.shutdown('test-termination');
  assert(finalState === 'OFFLINE', 'Brainstem shutdown reached OFFLINE');
  assert(shutdownTriggered === true, 'Emergency REFLEX shutdown signal dispatched to NeuroBus');

  globalBus.reset();
  let reflexCallCount = 0;
  globalBus.subscribe('reflex.test', () => {
    reflexCallCount++;
  });
  const reflexPublication = globalBus.publish({
    channel: 'reflex.test',
    source: 'test',
    priority: 'REFLEX',
    payload: {},
  }) as PublishResult<Record<string, never>>;
  assert(reflexPublication.accepted === true, 'REFLEX must be accepted');
  assert(reflexCallCount === 1, 'REFLEX handler must fire once immediately');
  await globalBus.drain(10);
  assert(reflexCallCount === 1, 'REFLEX handler must NOT fire a second time on drain');

  globalBus.reset();
  for (let i = 0; i < 1000; i++) {
    globalBus.publish({ channel: 'survival.flood', source: 'test', priority: 'SURVIVAL', payload: { i } });
  }
  const reflexUnderLoad = globalBus.publish({ channel: 'reflex.load', source: 'test', priority: 'REFLEX', payload: {} });
  assert(reflexUnderLoad.accepted === true, 'REFLEX must be accepted and shed lower priority SURVIVAL');
  assert(globalBus.getMetrics().totalDropped >= 1, 'At least 1 SURVIVAL frame must have been dropped');

  globalBus.reset();
  for (let i = 0; i < 1000; i++) {
    globalBus.publish({ channel: 'reflex.flood', source: 'test', priority: 'REFLEX', payload: { i } });
  }
  const userDropped = globalBus.publish({ channel: 'user.test', source: 'test', priority: 'USER', payload: {} });
  assert(userDropped.accepted === false, 'USER frame must be rejected when queue is full of REFLEX frames');

  globalBus.reset();
  for (let i = 0; i < 1000; i++) {
    globalBus.publish({ channel: 'reflex.flood', source: 'test', priority: 'REFLEX', payload: { i } });
  }
  const routerRes = thalamus.routeInput({ channel: 'user.input', source: 'user', payload: 'hello' });
  assert(routerRes.decision.accepted === false, 'Thalamus must report accepted: false on queue backpressure');

  globalBus.reset();
  let asyncReceived = false;
  globalBus.subscribe('async.worker', () => {
    asyncReceived = true;
  });
  globalBus.publish({ channel: 'async.worker', source: 'test', priority: 'LEARNING', payload: {} });
  assert(asyncReceived === false, 'Async frame not processed immediately');
  stopQueueConsumer();
  startQueueConsumer(25, 10);
  await new Promise((resolve) => setTimeout(resolve, 150));
  stopQueueConsumer();
  assert(asyncReceived === true, 'Continuous consumer must drain and process async frame');

  globalBus.reset();
  globalBus.publish({ channel: 'reflex.metric', source: 'test', priority: 'REFLEX', payload: {} });
  const publishedMetrics = globalBus.getMetrics();
  assert(publishedMetrics.totalPublished === 1, 'Published count must include REFLEX frames');
  assert(publishedMetrics.queueDepth.total === 1, 'Queue depth must include enqueued REFLEX frames');
  await globalBus.drain(10);
  const processedMetrics = globalBus.getMetrics();
  assert(processedMetrics.totalProcessed === 1, 'Processed count must increment after drain');

  console.log('=== All Phase 2 Step 2 Tests Passed ===');
}

runTests().catch((err) => {
  console.error('[UNHANDLED ERROR]', err);
  process.exit(1);
});
