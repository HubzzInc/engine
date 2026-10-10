# ADR 0004 — Two renderers, one spine (bones/skin/blueprint)

**Status:** Accepted

## Context
There are two strong renderers: the `spatial-mapping` app (macro: city map, zone view) and `network-lab` (world-client + the space-editor dollhouse). The temptation was to unify by porting one into the other; both directions throw away real optimization work.

## Decision
The system is one organism: **bones** (`network-lab`), **skin** (`spatial-mapping`), **blueprint** (specs + NESWUD). Unify at the **data layer**, not rendering. Each renderer stays where it lives and renders the tier it was built for; they meet through the spine, keyed by `space_id` (e.g. the city-map "Enter" → `space-editor ?spaceId=<id>`).

## Consequences
- No renderer is abandoned or rebuilt in the other's stack.
- The test for every change: does it graft skin or blueprint onto the bones? (See the `hubzz-architecture` skill.)
- spatial-mapping is the design source and reference implementation, not a parallel runtime.
