# Homeostasis Subsystem

## Overview
The **Homeostasis** subsystem acts as the physiological and metabolic regulator for the Solyra cognitive architecture. Implemented in `monitor.ts` and exported via `index.ts`, it samples runtime memory allocation and NeuroBus queue volume to derive the system's dynamic `ArousalLevel`.

## Core Responsibilities
1. **Telemetry Sampling (`sampleTelemetry`):** Evaluates Node.js heap consumption (`process.memoryUsage().heapUsed`) against the configured low-RAM ceiling (`lowRamCeilingBytes`) and observes NeuroBus queue congestion.
2. **Dynamic Arousal Derivation:** Calculates the active state according to the shared `ArousalLevel` domain contract (`Shared_Sol/src/index.ts`):
   - **`sleep`:** Minimal baseline metabolic state.
   - **`drowsy`:** Reduced activity or resting state.
   - **`alert`:** Standard active operating state for processing events and sensory inputs.
   - **`hyperaroused`:** Critical memory pressure or heavy backlog triggering protective sensory gating and shedding.
3. **State Transition Dispatches (`system.arousal`):** When transitions between arousal states occur, the monitor dispatches a `system.arousal` event onto the NeuroBus with `SURVIVAL` priority to alert all connected cognitive subsystems.
4. **Synchronous State Inspection (`getArousalLevel`):** Provides synchronous access to the current arousal state for downstream consumers such as the Thalamus sensory router.

## Architectural Integration
- **Source Module:** `Backend_Solyra/src/homeostasis/monitor.ts`
- **Singleton Export:** `globalHomeostasis = new HomeostasisMonitor(...)` in `Backend_Solyra/src/homeostasis/index.ts`
- **Type Contract:** `ArousalLevel` defined in `Shared_Sol/src/index.ts`
- **Bus Contract:** Emits `system.arousal` with priority `SURVIVAL`.