# ADR 0002 — NESWUD boundary is shape truth; the box is only an index

**Status:** Accepted

## Context
Spaces can be any shape (L, U, courtyard). A bounding box loses that — it over-covers, miscounts floor area, and places walls where the Space isn't. Approximating shape with `min/max` was proposed and rejected as it discards exactly what NESWUD exists to represent.

## Decision
Shape truth is the **NESWUD boundary**: each block is a node with six handshakes (N/E/S/W/U/D); a missing handshake IS a surface. The boundary (`computeSpaceShape`, `netFingerprint`) is the single source consumed by the editor shell, the validation gate, the world-client dollhouse, spawn placement, and walkability. The `space` row's box is an **index** for subscriptions only.

## Consequences
- Odd shapes have no special case; interior corners and courtyard walls fall out free.
- Every seam consumes `engine/` (`@neswud`), never the box.
- Shape identity for validation/mint is the position-invariant 2D-Net fingerprint.
- Verified by `ci/engine-checks.mjs` and `hubzz simulate` (L/U/courtyard cases green).
