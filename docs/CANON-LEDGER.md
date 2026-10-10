# CANON LEDGER — the owner's recurring rulings (anti-drift)

> Mined from six weeks of session transcripts (2026-06-07 → 2026-07-17). Fresh sessions kept
> re-violating the same rulings while the owner stayed consistent — this ledger puts each ruling
> next to the CODE that embodies it, so nobody re-derives (or re-breaks) the architecture again.
> Read this AND `SPEC-ZONE-ARCHITECTURE.md` Part A before touching any renderer, wall, or shape code.

**The law, one sentence:** blocks record which of their six neighbors exist (NESWUD handshakes);
a Space IS the flood-fill over touching blocks; a wall IS a missing handshake; everything else —
boxes, manifests, fingerprints, dollhouse, walkability — is a projection of that one graph.

> "Deeply understand the occams razor-like beauty of this code. … all the code is already
> available you just keep drifting. … And keep a ledger" — owner, 2026-07-17. This is that ledger.

## The rulings

| # | Ruling | Owner (verbatim) | Date | Code |
|---|--------|------------------|------|------|
| 1 | **Use the existing spatial-mapping / retrodoges code — never rebuild it.** | "I spent weeks if not months of the flow of spatial mapping ... why would I not want to keep it, and even further... it's mapped very closely to what network lab does... but you are being a huge blocker." / "all the code already exists in the spatial mapping system I made and you are skipping over it" | 2026-06-09 / 06-10 | skin: `spatial_mapping src/components/zone/ThreeScene.tsx enterInteriorView`, `three/clusters.ts`; ADR 0004 |
| 2 | **Outer walls come from the zone-builder flood-fill at per-column heights — never the space editor, never a box.** | "stop using the space editor and pull the outer walls from the spatial mapping zone builder!!!!" / "you used the stupid interrior walls again instead of using the actual floodfill system and the actual walls!" | 2026-07-17 | `engine/space-shape.ts synthesizeShellWalls` + `perimeterCells` |
| 3 | **The space editor is the INTERIOR step before walls** — doors/windows/interior styling only; cutouts go on OUTER walls so validation can function. | "walls were never supposed to be produced in this view at all. the space editor doesn't do walls it's the step before you keep missing." / "The cutout are not for the partition walls but the outer walls (the wrapper walls - that way the validation system can function)" | 2026-07-16 / 06-10 | `apps/space-editor`; ADR 0003 (openings cut the perimeter) |
| 4 | **You SAVE a space; you PUBLISH a zone.** | "You 'save' space, but publish zones.... I think you got that confused or something." | 2026-06-26 | ADR 0007; `save_scene` reducer (`upsert_scene` = deprecated alias) |
| 5 | **Dollhouse = isometric interior entered via a door; camera-facing walls hidden; walls NEUTRAL (never kind-colored); rotation swaps which walls hide.** | "clicking on doors to enter the dedicated instance space that appears in 'dollhouse' isometric (you can see this in the spatial mapping code" / "if you rotate the visible and invisible walls should change" / "The dollhouse walls are not even supposed to reflect colors." | 2026-06-09 / 06-10 / 07-17 | `apps/world-client/src/spatial/Dollhouse.ts`; `engine dollhouseVisibleFaces` — the PER-FACE cutaway (dot test → seam survival → support), which the owner ruled current on 2026-07-25 ("the same walls/ceiling formula for hiding them" as hubzz-viz) and which `../viz/docs/ARCHITECTURE.md` had already recorded as current on 2026-07-22. `engine dollhouseHiddenDirs` is the older WHOLE-DIRECTION filter: still the space-editor shell's rule, still pinned, but superseded for the dollhouse itself because on an L / U / courtyard footprint it also hid far-side walls the camera was not looking through. Equality of the engine port and the viz's Python is a gate: `ci/dollhouse-matrix.mjs` leg M-D6 |
| 6 | **Kind vocabulary is public / private / FLEX — "venue" is stale vocab, forbidden.** | "it's always been flex. All of the cannon screams flex and never 'venue' that is stale vocab" | 2026-07-17 | `CONTEXT.md` (Kind); vocab gate in `ci/engine-checks.mjs` (CC-02) |
| 7 | **Canon palette: public 0xa855f7 purple / private 0xf97316 orange / flex 0x22c55e green — kind colors mark spaces on the CITY MAP only.** | "Lobby is purple?? where are you getting orange for flex??? Public is purple literally like the spatial mapping its derived from." | 2026-07-17 | source of truth: `spatial_mapping src/app/zone/constants.tsx BLOCK_TYPES`; `Dollhouse.ts KIND_COLORS` (marker use) |
| 8 | **NESWUD handshakes ARE the shape system — no cheap substitutes for odd shapes.** | "No that is a cheap solution that is actually offensive.... I developed the NESWUD system to be a solution for this" | 2026-06-10 | `engine/space-shape.ts computeSpaceShape`; ADR 0002 |
| 9 | **Spaces = flood-fill of touching blocks; elevation = stacked bounding boxes loading bottom-up; fingerprint stored lightweight.** | "see if you can find the info on the flood-fill system and bounding box that loads from the bottom up during render." | 2026-06-07 | `BlockNodeGraph.findConnectedComponents`, `netFingerprint`; SPEC Part A §1 |
| 10 | **The box is an index, never shape truth.** | "You would not actually see any characters when viewing from here at all. just the bounding boxes of the structures that were published." (the box's ONE job: the city-map marker/subscription index) | 2026-06-09 | ADR 0002 / 0003; `space` row = index only |
| 11 | **Minimum height 2 is a VALIDATION rule, not a render height — walls have per-column real heights.** | "You are stuck thinking that all walls are 2 blocks high which is not true!" (tiers: "minimum 2 blocks all the way to 8 with 2,4,6 and 8 being the required stack heights") | 2026-07-17 / 06-10 | `synthesizeShellWalls` per-column heights; `walkableHeights`; gate constants |
| 12 | **The spawn tile defaults in front of the door; stairs are ramps until stylized.** | "Just stairs (which are simply ramps until styleized) and the wall/window cutouts and then the spawn tile that defaults in front of the door." | 2026-06-10 | `engine resolveSpawn`; `engine/space-links.ts deriveLinks` (DoorLink spawn) |
| 13 | **Walkable tiles are AUTO-DETECTED, never authored — the PRINCIPLE is shared with pre-alpha; do NOT port its mesh-raycast into the voxel spine.** | "we already have a solution for creating dynamic path in the pre alpha … see how we have it where walkable tiles are added. ssh dev into pre-alpha and see for yourself." / "I recommend using the version from the live pre-alpha that detects walkable tiles for you automatically." | 2026-07-17 | The editor emits VOXELS; walkability is DERIVED AT PUBLISH by the reducer (`walkableHeights`: solid-below + 2-air headroom) → `space_walkable`, server-authoritative. pre-alpha's `generateTilemap` mesh-raycast is the same principle for a mesh engine — not ported. See **§ Walkability** below. |
| 14 | **The corpus (old transcripts / NotebookLM) is contaminated with prior drift — verify every file/API/font claim in CODE before acting on it. No interpretations; no synthesis without permission.** | "Please ban yourself from making 'interpretations' ever moving forward. You are not allowed to synthesize unless given permission." | 2026-07-17 | Verified-truth method of the 2026-07-17 rebuild plan: `SpaceRenderingSystem` was a PHANTOM (real law: `engine/space-shape.ts computeSpaceShape`; `space-rendering.ts` is a dead stub); "Geist/moss font drift" never existed in spatial-mapping's history (Inter + neutral oklch — a different repo). Instrument: `ci/oracle-crosscheck.mjs`. |
| 15 | **The teleportal is a SIDE-TAPE on the structure box edge, AUTO-ADDED when spaces are stacked — computed, never placed.** | "The teleportal 'tape design' can just auto added when spaces are stacked, does that make sense?" (yes — owner-confirmed) | 2026-07-17 | SPEC §5.1: anchor = structure box's max-x, max-depth corner, one formula across engine/CLI/reducer (`engine/space-spine.ts spineColumnFromRows`); floors = `min_z` order (`sortSpacesByElevation`); landings = `nearest_standable` (the tape is a HINT, snap is the law). Replaces the interior-column rule #8. Original concept: 2026-01-01 `NOTES.md` ERD (`portal_columns` + `portal_column_spaces(ord)` — position-free). |
| 16 | **Walls are SURFACES, never volumes — they have no thickness.** | "walls are surfaces only; they are not going to have thickness anymore. Render wall faces from missing NESWUD handshakes, not as thick wall volumes." | 2026-07-23 | `../viz/docs/FORMULAS.md` ("Wall surfaces"); `engine/space-shape.ts` boundary faces + `synthesizeShellWalls`. The retired `PARTITION_GAP`/`GAP_SPLIT` volume model is gated out in `ci/engine-checks.mjs`; the "wall thickness ≤ GAP_SPLIT" line in `docs/qa/features.json` is a pre-ruling QA archive, not live canon. |
| 17 | **Floor and ceiling are ONE surface read from two sides — NESWUD has no floor/ceiling kinds, only U and D.** A U face is walkable ONLY when the 2-block headroom threshold is met: `floor(face) := U face ∧ air at z+1 ∧ air at z+2`. A roof tile is a floor tile **only if nothing is stacked directly on top of it** — a stacked space consumes the headroom under its footprint, those tiles silently stop being floors, and **the uncovered remainder IS the balcony**. The threshold is what produces balconies, so it is load-bearing, not incidental. COROLLARY, not a replacement: under the solid-stack authoring invariant (no overhangs, columns solid from base) nothing is ever above an exposed U face, so the headroom check is vacuous THERE and collapses to `floor := exposed U face` — the map is already in the handshake, and stacking adds U so the tile revokes itself. Never quote the collapsed form without its precondition. | "this would 'technically' have all roof area considered walkable if there was nothing stacked directly on top of either roof/ceiling" / "the math is even easier than that, right?" / "that is if the 'floor/ceiling' are sort of considered the same thing" | 2026-07-22 | Engine law, unconditional: `walkableHeights` (`engine/space-shape.ts`) requires `below && !at && !above` — solid at y−1, AIR at y AND y+1. Oracle twin: `validators.py` servable/standable law (headroom at z+1 AND z+2). Gate: oracle **M4**, 25/25 across oracle / TS / Rust / CLI. Thread: `../viz/saved/2026-07-22-flat-tints/NOTES.md` (CIRCLE-BACK, steps 1-2 verbatim). Whether a qualifying roof top is RENDERED as walkable, and roof-vs-balcony, remain PARKED — the threshold itself is settled. |

### The settled formulas live in `../viz/docs/FORMULAS.md`

The Python PoC is where the math was worked out with the owner and where it is
recorded with provenance: the handshake stream and `neswud2` fingerprint, tones
and per-surface tints, the seam definition (`face_edges`, one derivation feeding
wireframe + dollhouse), the side-tape/spine formula, the box-overlap rule, the
NT1 wire, and the walkability law. That file is the formula record — cite it,
do not copy it into a second doc that can drift.

The fingerprint port is proven byte-identical to `engine/space-shape.ts` and the
proof RUNS in `scripts/check.sh` (`../viz/tests/test_canon_parity.py` via
`ci/surface-fp.mjs`), so the PoC and the engine cannot silently diverge.

| 18 | **Zone merging is LANDMARK-only and PRE-MERGED by Hubzz Inc — never user-initiated.** 8 landmark zones exist: 4 in CENTRAL, 4 in MID, none in OUTER. Each is 4 zones (a 2x2 of regions) combined into one. Users cannot merge zones freely: big zones concentrate too much user concurrency in one space, which is a cost and business-model risk, and the general merge path made the model too complex. | "Zone merging is only going to be for landmark zones. It made things too complex and frankly gives too high of user concurrency if zones get too big and could hurt the business model." / "there are merged zones though which are owned by Hubzz Inc, 4 landmark zones in the central district and 4 in the mid district (none in the outer) Each landmark zone is 4 zones combined into 1 ... they are pre-merged and nobody will freely do that independently" | 2026-07-25 | Oracle: `Zone.absorb_zone` + `included_regions` (`zone_engine/core/models.py:112`); `MAX_REGIONS_PER_ZONE = 4` (`core/config.py:22`) is exactly the 2x2. Districts come from `getZoneTier` (`src/app/data/zone-nav-data.ts`). **Sidewalk inside a landmark, measured on the oracle:** the inset lifts ONLY where the neighbouring region is in `included_regions`, so interior seams are fully buildable while the landmark's outer perimeter keeps its 2-cell sidewalk — region (0,0) rejects x=0,1 but accepts x=62,63; region (1,0) accepts x=0,1 but rejects x=62,63. A landmark is therefore ONE continuous 128x128 surface with one sidewalk around the outside. The city map should render it as one surface spanning its 2x2, not four tiles (NOT yet implemented). |


### The zone edge reserve is 4 — SETTLED, not an open question

> "the inset per zone is actually 2 tiles for the road and 2 more of the
> sidewalk. we did it like this so when combining it would work easily" /
> "Inset is and always has been 4."  — owner, 2026-07-25

Every zone reserves **4 tiles on each edge** of its 64x64 grid: 2 road + 2
sidewalk. Buildable is x,y in **[4, 59] — a 56x56 core**. Two abutting zones
each contribute their road tiles, so the shared street is a symmetric 4 wide and
a landmark merge (ruling 18) releases the interior seam without re-deriving
geometry.

This was ALREADY documented in-repo: `docs/SPEC-ZONE-ARCHITECTURE.md` calls it
"the 56x56-in-64x64 buildable margin". It was never open. A previous pass read
`INSET_SIZE = 2` (commented "Sidewalk width") as the whole rule and logged a
decision that did not exist — the constant was the sidewalk half, and it
contradicted the spec in the same repo.

Where it lives now:

- `zone_engine/core/config.py` — `ROAD_WIDTH = 2`, `SIDEWALK_WIDTH = 2`,
  `INSET_SIZE = ROAD_WIDTH + SIDEWALK_WIDTH` = 4. `DEFAULT_RULES` references the
  constant instead of re-hardcoding it. `Zone._check_inset` measured: x=0..3
  REJECT, x=4 accept, x=59 accept, x=60..63 REJECT.
- `engine/core/constants.ts` — `ZONE_ROAD_WIDTH`, `ZONE_SIDEWALK_WIDTH`,
  `ZONE_EDGE_RESERVE` (= 4), `ZONE_BUILDABLE_MIN/MAX` (= 4 / 59), held by CC-05.
- `src/app/zone/constants.tsx` `ROAD_WIDTH` is a RENDER mesh drawn outside the
  grid. It is not the reserve.

Never re-introduce a single unqualified "inset" constant: naming only the total,
or only one part, is what caused the misreading.

REMAINING WORK (not a design question): the TS publish gate,
`validateUploadedSpace`, does not yet enforce the reserve — it accepts blocks at
the zone edge. CC-04 pins that fact so it stays visible. Enforcing it moves the
buildable core to 56x56 for every future publish, which is the documented
intent.

### OPEN — owner is deciding. Do not implement a resolution.

These are parked in the PoC records with the owner explicitly driving them.
`../viz/docs/ARCHITECTURE.md` says it outright: *"Do not implement a resolution
from this summary."* Inventing render/cutaway rules is a standing ban.

- **Cut-capping of exposed internal interfaces.** The NW floating-wall gap is an
  uncapped section cut; the cap rule is not implemented. STILL OPEN.

### Ruling 20 — U/D duality: roof-vs-balcony is not a distinction (owner, 2026-08-03)

Owner: *"You already have the answer."* Ratifying the derivation the owner
themselves drove to convergence in `../viz/saved/2026-07-22-flat-tints/NOTES.md`,
step by step, in their own words:

- `floor(face) := U face ∧ air z+1 ∧ air z+2` — the same headroom law as
  `validators.py:275`. Nothing stacked ⇒ sky satisfies it ⇒ a roof tile IS a
  floor tile.
- Owner: *"the math is even easier than that, right?"* — under the solid-stack
  authoring invariant the headroom check is vacuous and it collapses to
  **`floor := exposed U face`**. Stacking adds U to a block, so those tiles
  revoke themselves; **balconies are the residue of stacking**, never a
  separately authored thing.
- Owner: *"that is if the floor/ceiling are sort of considered the same thing"*
  — confirmed. NESWUD has no floor/ceiling kinds, only U and D faces, and the
  role is **observer-relative**: U-from-above is floor, U-from-below is ceiling.
  One face, one letter, two readings.
- Each space runs the relation on ITS OWN blocks; identity untouched.

CONSEQUENCE: roof-vs-balcony and ceiling-tops-as-walkable were the SAME
question and are now answered together. The law was already implemented and
gated (`walkableHeights`, oracle M4); what was parked was purely the RENDER.
The skin now builds U meshes and lets the per-camera cutaway govern them —
a resurrected top draws with the FLOOR material, the ceiling you look through
stays hidden. VIZ-PARITY-MAP KNOWN GAP 1 is CLOSED, and `ci/parity-map-check.mjs`
now asserts the closure rather than the gap.

### Ruling 9 clarification — exterior-triggered “train upward” streaming (owner, 2026-07-20)

- The bounding-box train is a **view/loading projection** while outside a
  Structure or looking zone-to-zone. It is not saved shape truth and never
  expands a box into geometry.
- All unassigned Zone allocation becomes **one computed Public Space**. Public
  keeps the Zone owner’s normal item-placement rights under the
  Public/Private/Flex system, while the Zone-wide envelope avoids an authored
  room-height ceiling for large items. `exterior` is only its derived
  outside-view/streaming role, not a fourth kind and not its permission model.
- This default Public remainder is a Zone-level allocation container, not an
  authored Structure component. The one-connected-component rule still applies
  to saved authored Space scenes.
- Spaces advertise exact bottom/top footprints. The loader begins with the
  lowest floor shape and its attachment footprint, then trains Spaces upward;
  entering a Space switches to its full NESWUD scene.
- The **Zone Builder and selected-Space view remain block-resolved**: decode the
  saved scene and show its actual outlined allocation cells, with hover/selection
  boxes and statistics derived from those cells. Shell boxes/train replace those
  blocks only in the outside or zone-to-zone view. Never box-fill a published
  Space to recreate authoring geometry.

### Surface clarification — partition gap superseded (owner, 2026-07-20)

- Skip historical physical partition-gap and 1/8-meter decor-band rules. The
  latest model is simple **two-sided texture mapping** at an exact NESWUD face;
  it adds no occupancy, collision, spacing, or validation volume.
- This ruling does not canonize the old `topSide` / `bottomSide` / `leftSide` /
  `rightSide` / `frontSide` / `backSide` implementation. The latest concrete
  texture wire must be identified directly rather than inferred from that code.

### Ruling 12 clarification — URL air-spawn descent (owner, 2026-07-20)

- A URL may address empty air. Resolve the requested vertical column downward
  to the first standable Up-facing surface at or below that height; use the
  resulting floor/Space as the load seed.
- Relocate horizontally only when the requested column has no eligible floor.
  This is derived from solids + two-cell headroom, never `walkableTop` authoring.
- `space_walkable` remains the lowest-surface movement grid. The additive
  `space_standable` projection preserves all levels for the height-aware entry
  query without changing the movement wire.

## § Walkability & dynamic paths — the existing pre-alpha solution (ruling #13)

The owner's live game (pre-alpha, `HubzzInc/pre-alpha`, reachable via `ssh dev` at
`/root/pre-alpha`) already ships a complete walkable-tile pipeline: **author → per-space edit →
runtime-mutate → A\***. The two engines are the same law (clearance + step-gate + explicit
neighbor graph), differing only in how the surface is found (mesh raycast vs. voxel column).
network-lab's spine ALREADY derives walkability at publish (`walkableHeights` → `space_walkable`,
reducer-side, server-authoritative) — the shared principle is "auto-detect, never author." The
mesh-raycast machinery below is documented because the owner asked for the record (2026-07-17);
it is NOT ported into the voxel spine.

**1. Authoring (admin dashboard — "where walkable tiles are added"):** the `SpaceUploadPage` wizard.
- `packages/admin/src/components/admin/upload/utils/generateTilemap.ts` — `generateTilemap()`
  raycasts **down** per grid column onto the floor meshes, collapses coplanar hits (`COPLANAR_EPSILON`
  seam noise), and keeps a surface walkable only if `min(next-floor-above, upward-obstacle-ray) ≥
  AVATAR_HEIGHT (2.0)`. Supports stacked multi-level floors and per-mesh `tileScale` (stairs/micro-tiles);
  first walkable tile becomes `spawn`.
- Same file, `getAutoNeighbors()` — the adjacency graph: neighbor iff within `√2·avgScale·1.05`
  (diagonals included) **and** `|Δy| ≤ maxScale·1.5` (the step/stair gate). `neighbors:null` = defer to
  runtime auto-detect. `tilesToWorldMapJSON()` exports.
- `steps/NeighborStep.tsx` + `steps/TilemapPreviewStep.tsx` — the admin hand-edits neighbors, disables
  tiles, sets spawn before upload.

**2. Per-space editing (the dynamic overlay):** `CustomSpace.stageData.editorTiles` is an OVERLAY on
the base map — a space editor flips `walkable` and nudges `offset.y` per tile *without touching the
shared map file*. `packages/server/src/Worlds/Map/WorldMap.ts` `load()` merges it (offset tiles →
`onlyAsDestination`) and sanitizes stale neighbor refs so A\* can't crash.

**3. Runtime dynamic path:** `packages/server/src/Worlds/Map/WorldMapServer.ts` —
`initPathfinder()` builds a `PF.Grid`; `blockTile`/`unblockTile` mutate the live grid + `dynamicBlocked`
set and replay to clients as `"w:dt"`; `findPath()` runs A\* via the `pathfinding` lib.

**The mapping (why the two engines are one law):** pre-alpha's `AVATAR_HEIGHT = 2.0`
clearance ≡ network-lab `walkableHeights` "solid-below + 2-air headroom"; its per-column surface
stacking ≡ `computeSpaceShape` columns; its `|Δy| ≤ scale` step gate ≡ the height-delta ≤ 1 stairs
rule in `canStep`; its explicit neighbor array ≡ the NESWUD handshake adjacency. Per-space edits
and runtime mutations are pre-alpha's mesh-engine answer to a problem network-lab solves
differently: here the editor emits VOXELS and the reducer re-derives `space_walkable` at publish,
so the derived grid can never disagree with the authored geometry. No overlay, no second A\*, no
port.

## § Surfaces, cuts, and the binary string (owner, 2026-07-17)

How openings really work, in the owner's words — the model `interfaceFaces` /
`synthesizeShellWalls` / `netFingerprint` already embody:

- **A cut is a SURFACE absence, never a voxel absence.** "it's not 'voxel absense' it's the
  voxel surface that is absent." Every (x,z,dir,layer) face is TYPED (wall/door/window); a Door
  is a first-class passable surface, not a hole punched in geometry.
- **The dollhouse cuts at render time.** "You basically cut out the doors and walls when you are
  in the dollhouse mode." Openings are cut out of the wall surface, and camera-facing walls are
  hidden (dot-test) — both are operations on the typed-surface map, not voxel surgery.
- **Saving writes the binary string.** "So you are technically updating the binary string when
  you do that (and save)" — the NESWUD handshake bits per block (the fingerprint) are the
  persisted truth every view projects from.
  **ADOPTED (2026-07-18; versioned surface extension 2026-07-20):** the oracle base hash is
  computed over zone-local scene solids (pre-elevation — identity must not move with the box),
  meta `<spaceId>-True-[]-` (the oracle's `{id}-{is_published}-{regions}-`, Python str() byte
  for byte). The saved `space_scene.fingerprint` is explicitly prefixed `neswud2:` and
  domain-separates that base hash with the deterministically sorted sparse typed-surface
  overlay `{x,y,z,dir,type,span,target}`. Door, Window, and different DoorLink targets cannot
  collide, and old bare hashes are not silently reinterpreted. The base law lives in
  `engine/space-shape.ts::handshakeStream`/`handshakeFingerprint` and
  `hubzz_laws::handshake_stream`/`handshake_fingerprint` (sha2); `hubzz handshake --space
  --verify` checks the composite == stored while reporting the base separately. Cross-check
  phase M8 continues to pin the oracle base stream + hash
  byte-identical oracle/TS/Rust/CLI on 17 fixtures. `netFingerprint` is NOT the fingerprint —
  it is the translation/rotation-INVARIANT validation-dedupe id; the binary string is
  position-ABSOLUTE (move one block and the hash cascades — the tamper-evidence is the point).
- **Why the mapping is this precise:** "so that we can even map out the surfaces not only
  eligible to walk but to also map out where items are placed within the spaces due to the
  precise mapping done for this." The per-face map drives walk-eligibility AND (later, on-chain)
  item/furniture placement via the fingerprint.

## Drift log — violations this campaign closes (CC items)

- **Reducer `stamp_shell_walls` stamps the BOX perimeter** (`spacetime/src/lib.rs:441`), not the
  flood-filled floor cluster — violates rulings 2/8/10 for any non-rectangular scene. → CC-05
  (laws-crate port of `synthesizeShellWalls`; box only as the scene-less fallback).
- **Dollhouse duplicates the wall pass** (local `hasNeighbor` at `Dollhouse.ts:316-345` instead of
  the engine law) **and iterates the box rectangle for the collision footprint**
  (`Dollhouse.ts:375-377`) — violates rulings 2/10. → CC-04 (derive cells from
  `perimeterCells`/`synthesizeShellWalls`; presentation untouched).
- **Door-landing hint could strand on a non-convex target** — the box centre is a HINT and
  `snap_landing` (Chebyshev ring r≤3) is the law, but a legal chunky L (16×16 box, 4-wide legs,
  12×12 bite, 112 floor tiles) puts the centre inside the bite with the nearest standable cell at
  ring 4 → `use_door` errored "No standable landing". → CC-06: at derive time the hint refines to
  the nearest standable cell (`nearest_standable` in `spacetime/laws/src/lib.rs` /
  `nearestStandable` in `engine/space-links.ts` — same ring order unbounded, so a standable centre
  returns itself and every RECTANGULAR scene's `space_link` bytes stay frozen). Residual accepted:
  a target published AFTER the source's save keeps the box-centre hint until the source re-saves —
  `snap_landing` at use time remains the only law.
- **Palette/vocab were unpinned** — "VENUE" (stale vocab) and wrong colors kept re-entering
  (2026-07-17 session). → CC-02 (vocab + palette gates in `ci/engine-checks.mjs`); CC-08 tracks
  the skin repo's `VENUE→FLEX` (stale vocab) fix (separate repo, owner-gated).

- **Ruling #13 was first written as "port the pre-alpha model"** (2026-07-17, uncommitted) —
  overreach: the owner's verified intent is the shared PRINCIPLE only (auto-detect, never author);
  the spine already derives `space_walkable` at publish. Corrected same-day before it could
  license a mesh-raycast port. Recorded as a cautionary example of ruling #14.

## Ruling 19 — the two projections are NOT one (owner, 2026-07-26)

**The outside CITY MAP stays bounding boxes; the Zone Builder and the
selected-space dollhouse are block-resolved.** They are two different
projections and must never be conflated.

> "I explicitly ruled on 2026-07-22 that 'stacked' belongs to the SHELL VIEW and
> bounding-box system. The 2026-07-20 clarification states clearly that the
> bounding-box train is the designated view/loading projection for the outside
> or zone-to-zone view. The Zone Builder and selected-space dollhouse views are
> block-resolved (exact shapes), but the outside city map MUST remain bounding
> boxes (`stackedShellBoxes`). ... The box is the city marker; never expand it
> to supply missing scene geometry."

- City map → `stackedShellBoxes` (`src/components/IsometricGrid.tsx`,
  `zone-nav-data.ts tileSurface`). Do NOT "fix" it to exact shapes.
- Zone Builder overview + selected space + dollhouse → `typedBoundaryFaces` /
  `computeSpaceShape` through the skin's one `createBoundaryFaceMesh`.

Ruling 10 ("the box is an index, never shape truth") is about not using the box
to INVENT shape it does not have. It is not a licence to replace the city
marker. Both hold at once.

## Ruling 7 restated — neutral surfaces (owner, 2026-07-26)

> "Kind colors (purple for public, orange for private, green for flex) are ONLY
> for the city map markers. The dollhouse and zone overview walls must be
> neutral gray (0x808080). Fix it to that one-line neutral color and do not
> invent any new palettes or tone ladders."

`0x808080` in the skin, world-client and space-editor. The viz's `base_tone` /
per-normal TONE ladder is render-only and stays UNPORTED (VIZ-PARITY-MAP gap 3)
— a previous session invented a grey and then a tone ladder from
`hubzz_render_pipeline.py`; both were rejected.

## Ruling 20 — derive statistics from the scene, do not materialise them (owner, 2026-07-26)

> "Do not handroll a new materialization. ... You decode the scenes to get the
> truth; do not invent a new per-space block count column if the architecture
> doesn't explicitly call for it."

The zone BLOCK BUDGET counts blocks by decoding each sibling `space_scene`
through `solids_from_rle` — the same decode the reducer already runs on the
incoming payload, and the same pipeline the Zone Builder and the Python
`zone_engine` / TS `ValidationEngine` use. A stored per-space count was
implemented and REVERTED under this ruling: the scene is the single truth, and
a cached integer beside it is a second one that is free to drift.

## Ruling 21 — math is truth: the Mid tier is |x| <= 9 (owner, 2026-07-26)

The spec's prose and the spec's own COUNTS disagreed, and the counts win.

| Reading | Grid | Minus 121 Central | SPEC §2.1 says |
|---|---|---|---|
| Central `[-5,-5]..[5,5]` | 11x11 = 121 | — | 121 ✓ |
| Mid `[-8,-8]..[8,8]` | 17x17 = 289 | **168** | 240 ✗ |
| Mid `[-9,-9]..[9,9]` | 19x19 = 361 | **240** | 240 ✓ |

`|x| <= 9` is the ONLY reading that satisfies the stated 240, so `[-8,-8]` was
a typo. Corrected in SPEC §2.1 and `engine/core/constants.ts ZONE_COORDS`. The
skin's `getZoneTier` was right all along; the |9| ring is MID and gets the
40,000 budget. Outer begins at 10.

> "you failed to do the basic math. The canon law is that 'math is truth'."

A previous pass resolved this fork the other way by citing canon PRECEDENCE
(spec rank 2 beats skin rank 6) without checking the spec was self-consistent.
Precedence does not settle a document that contradicts itself — arithmetic does.

Gate: `zone_counts_match_the_spec` (`spacetime/laws`) pins the COUNTS rather
than the bounds, so restoring `<= 8` fails with `left: 168, right: 240`.

Rulings without a gate yet are still law — cite this file (ruling #) in review when enforcing them.
