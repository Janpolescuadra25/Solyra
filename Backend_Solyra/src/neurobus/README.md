# NeuroBus Substrate (@solyra/backend)

**Status:** DONE (Verified Baseline — Phase 2 Step 1)  
**Verified Commit PIN:** 51400291ede928d9f9e86ddcbe35555d23ffc789  
**Module Path:** Backend_Solyra/src/neurobus

---

## 1. Overview & Architectural Role

The **NeuroBus** is Solyra's central nervous system message bus. Designed for developmental, low-RAM biological emulation, it provides starvation-free event routing between the Brainstem, Homeostasis monitor, cognitive agents, and sensory interfaces.

Unlike conventional message brokers, NeuroBus enforces biological priority scheduling and bounded memory backpressure shedding: under high cognitive load or memory pressure, non-critical background thoughts are discarded while reflexive survival signals are guaranteed delivery.

---

## 2. Priority Hierarchy

Frames are prioritized in strict monotonic order:

| Priority | Numeric Rank | Description | Shedding Behavior |
|----------|--------------|-------------|-------------------|
| REFLEX | 0 | Emergency shutdown, kill-switches, immediate alarms | **NEVER SHED** — Dispatched synchronously on publish |
| SURVIVAL | 1 | Heartbeats, watchdog pings, memory pressure warnings | **NEVER SHED** — High-priority queue |
| USER | 2 | Direct user input, active conversational turns | Protected — Shed only under extreme REFLEX saturation |
| LEARNING | 3 | Background knowledge consolidation, memory index updates | Shed second under backpressure |
| IDLE | 4 | Cache pre-warming, housekeeping, telemetry logging | **Shed first** under backpressure |

---

## 3. Subsystem Architecture & Key Files

- priority-queue.ts: BoundedPriorityQueue implementing multi-bucket priority storage with configurable capacity (default: 1000 frames), high-water mark tracking, and automatic low-priority shedding.
- 
eurobus.ts: NeuroBus engine providing:
  - publish(input): Enqueues frames, triggers synchronous immediate dispatch for REFLEX frames.
  - subscribe(channel, handler): Channel-based pub/sub subscription returning an unsubscribe function.
  - processNext(): Dequeues and asynchronously dispatches the highest-priority frame.
  - drain(maxFrames): Batch dispatches queued frames up to a budget.
  - getMetrics(): Returns live telemetry (	otalPublished, 	otalProcessed, 	otalDropped, queueDepth, ctiveSubscribers).
- index.ts: Exports the public API and singleton globalBus.
- ../../Shared_Sol/src/index.ts: Canonical TypeScript contracts (NeuroBusFrame, PriorityQueueDepth, NeuroBusMetrics, ArousalState).

---

## 4. Public Endpoints & Integration

Integrated into Backend_Solyra/src/index.ts:
- GET /ready: Reports 
eurobus: 'online' and live queue depth.
- GET /neurobus/metrics: Exposes full queue metrics JSON:
  `json
  {
    "totalPublished": 0,
    "totalProcessed": 0,
    "totalDropped": 0,
    "queueDepth": { "REFLEX": 0, "SURVIVAL": 0, "USER": 0, "LEARNING": 0, "IDLE": 0, "total": 0 },
    "capacity": 1000,
    "highWaterMark": 0,
    "activeSubscribers": 0
  }
  `

---

## 5. Verification & Testing

Validated via package-scoped test suite:
- Strict FIFO ordering within priority buckets.
- Strict cross-priority dispatch: REFLEX > SURVIVAL > USER > LEARNING > IDLE.
- Bounded capacity invariant: total depth never exceeds capacity.
- Backpressure shedding: drops IDLE then LEARNING frames on overflow.
- Synchronous reflex handler execution.
