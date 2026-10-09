# Brainstem Subsystem (@solyra/backend)

**Status:** DONE (Verified Baseline — Phase 2 Step 2)  
**Module Path:** `Backend_Solyra/src/brainstem`

---

## 1. Overview & Architectural Role

The **Brainstem** is Solyra's autonomic life-support foundation. It orchestrates the ordered startup sequence, emits continuous vitality heartbeats, monitors cognitive health via watchdogs, and guarantees clean, deterministic system shutdown.

---

## 2. Lifecycle State Machine

```
[ OFFLINE ] ---> [ BOOTING ] ---> [ STANDBY ] ---> [ ONLINE ]
     ^                                                 |
     |------------- [ SHUTTING_DOWN ] <----------------|
```

---

## 3. Key Components & Integration

- `brainstem.ts`: Core `Brainstem` class:
  - `boot()`: Transitions states, checks NeuroBus health, starts heartbeats.
  - `startHeartbeat()`: Emits `SURVIVAL` frames on channel `system.heartbeat` every 5s.
  - `feedWatchdog()` & `checkWatchdogLiveness()`: Monitors cognitive vitality.
  - `shutdown()`: Emits synchronous `REFLEX` signal on channel `system.shutdown` and cleans up resources.
- Companion subsystems:
  - `Backend_Solyra/src/homeostasis/`: Senses memory pressure and sets `ArousalLevel`.
  - `Backend_Solyra/src/thalamus/`: Gates external inputs into NeuroBus.
- Permanent test suite: `Backend_Solyra/test/brainstem.verify.ts`.
