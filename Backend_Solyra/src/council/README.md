# Council Consensus Engine

The Council subsystem provides the deliberation layer for the Solyra brain. It coordinates a 7-member advisory body that evaluates proposals, enforces guardrails, and emits live telemetry to the NeuroBus event stream.

## Roles

| Role | Responsibility |
| --- | --- |
| `YOSHI` | Planning, task decomposition, priorities, and session goals |
| `ASH` | Knowledge retrieval, memory indexing, and provenance tracking |
| `BEN` | Construction, DSL/AST generation, and validation tests |
| `CHA` | Research, documentation, and external grounding |
| `REX` | Security boundaries, execution restrictions, and veto authority |
| `VAL` | Correctness checks, regression detection, and veto authority |
| `LIA` | Final answer organization, user communication, and request fulfillment |

## Deliberation Protocol

1. A proposal is created with a unique ID, title, description, and initiator.
2. Council members cast votes through `castVote(...)`.
3. The engine resolves the proposal when the vote set closes or when a veto is exercised.
4. A proposal is approved only when at least 4 of the 7 members approve and no veto is present.

## Veto Authority

`REX` and `VAL` are the only roles that can exercise a veto. Their vetoes are enforced regardless of the majority vote count.

- `REX` vetoes for security boundary violations.
- `VAL` vetoes for correctness and regression risks.

## Consensus Rule

The strict majority threshold is:

- Approval requires `>= 4/7` votes.
- A veto immediately rejects the proposal.
- A proposal without majority support is rejected.

## NeuroBus Events

The Council engine emits:

- `council:deliberation:started`
- `council:deliberation:concluded`

These events are emitted through `globalBus` and can be observed by any subsystem subscribing to the bus.

## Telemetry Endpoint

`GET /council/stats` returns the current Council telemetry payload.

Example response:

```json
{
  "totalDeliberations": 12,
  "approvedCount": 7,
  "rejectedCount": 4,
  "vetoedCount": 2,
  "activeDeliberations": 1
}
```

## Runtime Notes

- The engine validates member roles at runtime.
- Duplicate votes for the same member are rejected.
- Completed proposals remain immutable once concluded.
- The singleton `globalCouncil` is exported from `Backend_Solyra/src/council/index.ts`.
