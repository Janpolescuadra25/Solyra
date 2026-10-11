# NeuroBus Substrate (@solyra/backend)

**Status:** DONE - FULLY VERIFIED  
**Module Path:** Backend_Solyra/src/neurobus

---

## 1. Overview

The NeuroBus is Solyra's central runtime event bus. It coordinates the Brainstem, Homeostasis monitor, Thalamus router, and other system modules with strict prioritization, bounded queue capacity, and runtime observability.

This implementation is fully verified for the Phase 3.5 runtime stability fixes: REFLEX dispatch safety, low-priority shedding during saturation, accepted/rejected publish reporting, and continuous queue draining.

---

## 2. Priority Hierarchy

Frames are prioritized in strict order:

| Priority | Numeric Rank | Description | Shedding Behavior |
|----------|--------------|-------------|-------------------|
| REFLEX | 0 | Emergency shutdown, alarms, immediate signals | Never shed; executes synchronously |
| SURVIVAL | 1 | Heartbeats, watchdogs, system-failure telemetry | Shed only after IDLE, LEARNING, USER when REFLEX arrives under saturation |
| USER | 2 | Direct user input and active interactions | Shed before SURVIVAL when queue is full |
| LEARNING | 3 | Background memory and inference tasks | Shed before USER and SURVIVAL |
| IDLE | 4 | Cleanup and telemetry housekeeping | Shed first |

---

## 3. Publish Contract and Dispatch Semantics

`NeuroBus.publish<T>()` returns a `PublishResult<T>` object:

```ts
export interface PublishResult<T = unknown> {
  frame: NeuroBusFrame<T>;
  accepted: boolean;
}
```

When a `REFLEX` frame is published:
- the handler is invoked immediately via `dispatchImmediate(frame)`
- `frame.dispatched = true` is set before the frame enters the queue
- the frame remains queued so the queue depth, saturation metrics, and throughput counters still reflect actual runtime activity
- later `drain()` calls must not execute the same subscriber handler a second time

This ensures the runtime does not double-dispatch the same reflex frame while preserving metric correctness.

---

## 4. Queue Eviction Semantics

The queue uses `BoundedPriorityQueue.shedLowPriority(incomingPriority)` to drop lower-priority payloads when the queue is full.

The eviction chain is:

```ts
IDLE -> LEARNING -> USER -> SURVIVAL
```

This matters during `REFLEX` saturation: if a REFLEX frame arrives while the queue is at capacity, the scheduler sheds lower-priority frames, including `SURVIVAL` entries, before rejecting the incoming REFLEX frame.

---

## 5. Continuous Queue Consumer

The runtime now wires a background worker in `Backend_Solyra/src/index.ts`:

- `startQueueConsumer(intervalMs, batchSize)` begins timer-driven draining
- `stopQueueConsumer()` clears the timer and stops draining
- `SIGTERM` and `SIGINT` listeners invoke shutdown cleanup for the queue and HTTP server

This keeps background non-reflex traffic moving without requiring manual drain calls from the application layer.

---

## 6. Backpressure and Error Visibility

The Thalamus router checks the publish result before accepting input:

```ts
const publishResult = globalBus.publish<T>({ ... });

if (!publishResult.accepted) {
  return {
    decision: {
      accepted: false,
      reason: 'Queue backpressure: frame dropped',
      assignedPriority: 'USER',
      channel: input.channel,
    },
    frame: publishResult.frame,
  };
}
```

This gives callers explicit backpressure feedback instead of incorrectly reporting a successful enqueue.

---

## 7. Public Integration

Relevant runtime integration points:
- `Backend_Solyra/src/neurobus/neurobus.ts` — bus engine and `PublishResult`
- `Backend_Solyra/src/neurobus/priority-queue.ts` — bounded queue and low-priority shedding
- `Backend_Solyra/src/thalamus/router.ts` — acceptance gating and backpressure reporting
- `Backend_Solyra/src/index.ts` — queue consumer lifecycle and `/ready` readiness handling
- `Shared_Sol/src/index.ts` — canonical `NeuroBusFrame` contract with `dispatched?: boolean`

---

## 8. Verification

Verified by the runtime regression suite and package build:
- `pnpm -r run build`
- `pnpm exec tsx test/brainstem.verify.ts`
- `pnpm exec tsx test/persistence.verify.ts`
- `pnpm exec tsx test/postgres.verify.ts`

All passed successfully for the Phase 3.5 runtime stability package.
