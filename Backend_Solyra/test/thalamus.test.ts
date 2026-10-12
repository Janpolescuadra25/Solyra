import { ArousalLevel, SystemPriority } from '@solyra/shared';
import { NeuroBus } from '../src/neurobus/neurobus.js';
import { HomeostasisMonitor } from '../src/homeostasis/monitor.js';
import { ThalamusRouter } from '../src/thalamus/router.js';

async function runTests(): Promise<void> {
  console.log('--- START THALAMUS VERIFICATION SUITE ---');

  const bus = new NeuroBus({ capacity: 1000 });
  const monitor = new HomeostasisMonitor();
  const router = new ThalamusRouter(bus, monitor);

  router.registerRoute('sensory.*', SystemPriority.USER, ArousalLevel.ALERT);
  router.registerRoute('danger.*', SystemPriority.REFLEX);
  router.registerRoute('background.*', SystemPriority.IDLE, ArousalLevel.ALERT);

  (monitor as any).currentArousal = ArousalLevel.ALERT;
  const res1 = await router.routeFrame({
    channel: 'sensory.vision',
    source: 'eye_module',
    payload: { object: 'tree' },
  });

  if (!res1.routed || res1.priority !== SystemPriority.USER) {
    throw new Error(`Test 1 Failed: Expected USER route, got ${JSON.stringify(res1)}`);
  }
  console.log('✓ Test 1 Passed: Alert sensory frame routed at USER priority');

  (monitor as any).currentArousal = ArousalLevel.SLEEP;
  const res2 = await router.routeFrame({
    channel: 'background.metrics',
    source: 'telemetry_module',
    payload: { cpu: 12 },
  });

  if (res2.routed || !res2.suppressed) {
    throw new Error(`Test 2 Failed: Expected suppressed background frame, got ${JSON.stringify(res2)}`);
  }
  console.log('✓ Test 2 Passed: Background frame suppressed during SLEEP state');

  (monitor as any).currentArousal = ArousalLevel.DROWSY;
  const res3 = await router.routeFrame({
    channel: 'background.metrics',
    source: 'telemetry_module',
    payload: { cpu: 13 },
  });

  if (res3.routed || !res3.suppressed) {
    throw new Error(`Test 3 Failed: Expected suppressed background frame at DROWSY, got ${JSON.stringify(res3)}`);
  }
  console.log('✓ Test 3 Passed: Background frame suppressed during DROWSY state');

  (monitor as any).currentArousal = ArousalLevel.SLEEP;
  const res4 = await router.routeFrame({
    channel: 'danger.critical',
    source: 'thermal_sensor',
    payload: { temp: 105 },
  });

  if (!res4.routed || res4.priority !== SystemPriority.REFLEX) {
    throw new Error(`Test 4 Failed: REFLEX bypass failed, got ${JSON.stringify(res4)}`);
  }
  console.log('✓ Test 4 Passed: REFLEX frame bypassed SLEEP state');

  const stats = router.getRoutingStats();
  if (stats.routedCount !== 2 || stats.suppressedCount !== 2 || stats.activeRoutes !== 3) {
    throw new Error(`Test 5 Failed: Stats mismatch ${JSON.stringify(stats)}`);
  }
  console.log('✓ Test 5 Passed: Routing statistics match expectations');

  (monitor as any).currentArousal = ArousalLevel.ALERT;
  const res5 = await router.routeInput('legacy_sensor', { touch: true });
  if (!res5.routed || res5.priority !== SystemPriority.USER) {
    throw new Error(`Test 6 Failed: routeInput did not route correctly ${JSON.stringify(res5)}`);
  }
  console.log('✓ Test 6 Passed: Backward-compatible routeInput executed cleanly');

  const finalStats = router.getRoutingStats();
  if (finalStats.routedCount !== 3) {
    throw new Error(`Test 7 Failed: final routed count mismatch ${JSON.stringify(finalStats)}`);
  }
  console.log('✓ Test 7 Passed: routeInput incremented counts correctly');

  console.log('=== ALL THALAMUS VERIFICATION TESTS PASSED ===');
}

runTests().catch((error: unknown) => {
  console.error('THALAMUS VERIFICATION SUITE FAILED:', error);
  process.exit(1);
});
