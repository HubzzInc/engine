# ADR 0003 — The shell IS the outer wall; openings cut the perimeter

**Status:** Accepted

## Context
A space's enclosure is its box. Early on, users had to re-draw a wall ring in voxels to satisfy the height rule, because the validation gate ignored the shell — wrong semantics, and it produced phantom inner walls.

## Decision
The **shell** (the box perimeter, derived from boundary faces) **is the outer wall**. The validation gate synthesizes the shell perimeter (minus openings) into its payload, so a floor + shell validates as the enclosed Space it is. **Openings** (doors/windows) are cut into **outer** walls only — never interior partitions — so validation can reason about entrances. A **private** Space requires at least one door opening.

## Consequences
- Users never re-draw enclosure walls; floor-only Spaces validate.
- Door/window tools project onto the nearest perimeter wall and register an opening; a door also drops the spawn tile on the interior side.
- Occupancy and floor area count the true cells, not a duplicated ring.
