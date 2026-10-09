import { Brainstem } from '../src/brainstem/brainstem.js';
import { HomeostasisMonitor } from '../src/homeostasis/monitor.js';
import { ThalamusRouter } from '../src/thalamus/router.js';
import { globalBus } from '../src/neurobus/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log('=== Running Phase 2 Step 2 Subsystems Verification ===');

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

  console.log('=== All Phase 2 Step 2 Tests Passed ===');
}

runTests().catch((err) => {
  console.error('[UNHANDLED ERROR]', err);
  process.exit(1);
});
