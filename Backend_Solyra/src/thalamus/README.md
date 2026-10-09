# Thalamus Subsystem

## Overview
The **Thalamus** subsystem functions as the sensory relay and attentional gating router for Solyra. Implemented in `router.ts` and exported via `index.ts`, it ingests incoming sensory signals, evaluates system physiological state via Homeostasis, and determines whether signals are admitted or suppressed.

## Core Responsibilities
1. **Sensory Ingestion (`SensoryInput<T>`):** Accepts sensory payloads encapsulating signal channel (`input.channel`), source, data payload, and metadata.
2. **Arousal-Aware Sensory Gating (`routeInput`):**
   - Synchronously queries `globalHomeostasis.getArousalLevel()`.
   - **During `hyperaroused` state:** Applies strict protective filtering by dropping background sensory inputs where `input.channel.startsWith('background.')` to safeguard memory and preserve core processing bandwidth.
   - **During non-hyperaroused states (`alert`, `drowsy`, `sleep`):** Permits sensory traffic through the gateway.
3. **Cognitive Bus Routing:** Admitted inputs are published to the NeuroBus using the designated `input.channel` at `USER` priority. (The ingress HTTP layer in `Backend_Solyra/src/index.ts` defaults unassigned channels to `user.input`).
4. **Deterministic Routing Feedback:** Returns a boolean routing result indicating whether the frame was accepted and forwarded to the bus or suppressed by gating policies.

## Architectural Integration
- **Source Module:** `Backend_Solyra/src/thalamus/router.ts`
- **Singleton Export:** `thalamusRouter = new ThalamusRouter(...)` in `Backend_Solyra/src/thalamus/index.ts`
- **Sensory Contract:** `SensoryInput<T>`, routing to NeuroBus with `priority: 'USER'`.