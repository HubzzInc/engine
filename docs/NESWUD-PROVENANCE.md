> Published from the private research notes with machine-local citation paths redacted. The contradiction register is the load-bearing section; redacted citations are not verifiable from this repo.

# NESWUD provenance: how the current spatial law emerged

**Research snapshot:** 2026-07-20
**Scope:** the current `network-lab-stdb` code and owner rulings; the original
2D-Net documents; the archived TypeScript prototype; the Python experiments and
oracle; the primary simulator at
`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine`; the design records
at `[local archive]/user/github/spatial-mapping/spatial-mapping/docs`; the
`russfranky/spatial_mapping` skin and its Git history; the saved terminal
transcripts; the NotebookLM PDF/video; and NotebookLM notebook
`50ffee5e-d967-4f3c-b02b-d3abec4ac5bf`.

## Executive finding

NESWUD is not one untouched implementation. It is a set of compatible ideas
that were built in different generations but have not yet been synthesized into
one lightweight authored-and-persisted representation:

1. The first 2D-Net described a compact, planar token/bitmask whose cells carried
   N/E/S/W connector bits plus vertical continuation/termination state. A mutual
   connector check and flood-fill reconstructed the volume from any seed.
   (`[local archive]/Documents/Archives/Code_Snapshots/_archive/hubzz-neswud-concept/Documentation/technical-implementation/2d-net-driven-architecture.md:7-31`;
   `[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:23-40,42-66,88-122`)
2. The TypeScript voxel-engine prototype made that idea concrete as a graph of
   position-indexed block nodes. Links are reciprocal, auto-derived from the six
   unit neighbors, and connected components are found by flood-fill. That code
   is the direct ancestor of today's `engine/core`.
   (`engine/core/block-node.ts:20-38,80-101,149-164,243-287`)
3. The later Python/“Jack” line reframed the six directions as six independently
   addressable surface points. For every voxel and direction, an absent neighbor
   emits a `(voxel, direction)` face; another pass can classify that face by the
   void behind it and hash the ordered face-address data.
   (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/geometry_utils.py:15-27,48-98,117-156`)
4. The current system combines those two insights. Blocks and reciprocal
   handshakes define topology; every unpaired N/E/S/W/U/D slot is a boundary-face
   address; typed interfaces change the surface at that address without deleting
   or moving it. Everything else is a projection of this graph.
   (`docs/CANON-LEDGER.md:8-10,76-103`; `engine/space-shape.ts:90-145,665-711`)
5. The current scene format, however, is not the original 9-bit net. It RLE-encodes
   six material/face slots per 64³ cell; the canonical sparse-block encoder writes
   six copies of one type, while the inherited editor can set faces independently.
   The decoder collapses any occupied slot to a solid. The graph, Jack boundary
   addresses, and textual handshake SHA-256 are derived later in separate passes.
   (`engine/scene-codec.ts:1-9,17-84`; `apps/space-editor/src/scene/voxels/VoxelZone.ts:21-33,217-239,279-280`;
   `engine/space-shape.ts:90-145,183-232`)
6. During this research pass, the first working synthesis tracer was added to the
   TypeScript/CLI seam and corrected after the owner recovered the “train upward”
   rule. NT1 stores consecutive equal floor shapes once with a repetition count,
   carries 9-bit N/E/S/W/presence/Up/Down attachment tokens per distinct footprint,
   supports multiple horizontal islands, reciprocal-validates on decode, and
   proves train → exact blocks → existing oracle base hash. It is a derived
   outside-view/streaming projection, not yet the saved editor wire; a Rust NT1
   mirror and reducer persistence remain outstanding.
   (`engine/space-shape.ts:282-515`; `cli/src/hubzz.ts:376-427`;
   `ci/engine-checks.mjs:228-260`)

The best reading of the research is therefore **unfinished synthesis, not a
sequence of wholesale replacements**. The 9-bit token supplies the compact
local authored state; the graph supplies reciprocal traversal and Space identity;
the Jack supplies exact boundary-face addresses; typed interfaces supply surface
semantics; the fingerprint commits to the resulting adjacency. Most of these
pieces exist and pass independently, and the new TS/CLI train tracer now relates
token → blocks → graph law → oracle base fingerprint. A versioned `neswud2:` saved
identity now adds the sorted sparse typed-surface overlay in TS and Rust so Door,
Window, and DoorLink targets do not collide. What remains is the derived exterior
streaming scheduler/NT1 Rust parity, editor wire adoption, placement addresses,
and client adoption of the new all-level landing projection—without treating six
renderer/material slots as connector truth or inventing a second graph. This is a consolidation target inside the existing law, not a
proposal for a competing engine.
(`[local archive]/Downloads/Hubzz_MasterDocs/2d_net_architecture.md:7-48`;
`engine/scene-codec.ts:17-84`; `engine/space-shape.ts:90-515,665-711`)

The octahedron/Jack doodle is therefore useful as a **mental model for six
independent face slots**, but it is not a new storage law. The current law does
not depend on the drawn octahedron, the numerical labels 1–6, or a particular
unfolding. It depends on the lettered direction/opposite pairs and exact face
address. Current opposites are N↔S, E↔W, U↔D.
(`engine/space-shape.ts:25-40,78-88`; `engine/core/block-node.ts:80-101`)

The recovered February 2026 Zone Builder screenshots also identify the intended
authoring presentation precisely: placed allocation remains visible as
individually outlined cubes on the 64×64 grid; classification colors were Flex
`0x7ED36E`, Public `0x6FA8E2`, and Private `0xE2B85E`; a transparent cluster box
was an overview/selection projection rather than replacement geometry. The
implementation survives in the `spatial_mapping` history: each block is a cube
plus `EdgesGeometry`/`LineSegments`, and the application initially selected
Public. This visual can be restored independently of the current NESWUD law.
(`[local archive]/src/github.com/russfranky/spatial_mapping@16029476:src/app/zone/constants.tsx`;
`[local archive]/src/github.com/russfranky/spatial_mapping@16029476:src/app/components/zone/ThreeScene.tsx`;
`[local archive]/src/github.com/russfranky/spatial_mapping@04631127^:src/app/zone/ZoneBuilderApp.tsx:37`)

A second screenshot pins selection behavior: yellow `Box3Helper` was hover,
white was selection, and selection exposed block count, floor-tile count,
capacity, and Space actions while leaving every gridded cell visible. The code
still contains those yellow/white helpers and the selected-Space panel. Two
later changes explain the regression rather than a missing design: `49f77a66`
replaced the blue/green/gold palette, while `66afe3ba`/`e5a19b77` correctly
stopped box-filling published AABBs but left published Zone Builder selection on
shell boxes and box-derived statistics. The correct seam is not to resurrect
box-fill: outside view uses the cheap box/train; Zone authoring/selection decodes
the real `space_scene` and renders its exact outlined cells, deriving statistics
from those cells.
(`[local archive]/src/github.com/russfranky/spatial_mapping/src/components/zone/ThreeScene.tsx:928-1022,1290-1299`;
`[local archive]/src/github.com/russfranky/spatial_mapping/src/components/zone/SelectedSpacePanel.tsx:80-100`;
`[local archive]/src/github.com/russfranky/spatial_mapping@49f77a66:src/app/zone/constants.tsx`;
`[local archive]/src/github.com/russfranky/spatial_mapping@e5a19b77:src/components/zone/ThreeScene.tsx`)

The original opened Dollhouse screenshot pins the next projection in the same
flow: selected Zone Space → in-place isometric cutaway → exact per-cell floor
and missing-neighbor wall planes → return to the saved Zone camera. The original
code hid the two most camera-facing walls dynamically and kept the selection
statistics/actions visible. That spatial behavior is retained canon. Two visual
details are historical rather than law: the interior was tinted by Space kind,
where the later owner ruling requires neutral Dollhouse walls, and the visible
cell seams originally came partly from `EFFECTIVE_CELL_SIZE`/partition spacing,
which must now be reproduced only as a line/grid presentation if desired—not as
physical gaps. (`[local archive]/src/github.com/russfranky/spatial_mapping@16029476:src/app/components/zone/ThreeScene.tsx:1276-1290,1299-1470,1715-1783`;
`docs/CANON-LEDGER.md:22-23,51-59`)

## Authority and method

This report applies this precedence order:

1. **Owner-adjudicated law:** `docs/CANON-LEDGER.md` and Part A of
   `docs/SPEC-ZONE-ARCHITECTURE.md`. The ledger explicitly says that old
   transcripts and NotebookLM contain prior drift and that claims must be
   checked in code. (`docs/CANON-LEDGER.md:1-13,31-33`;
   `docs/SPEC-ZONE-ARCHITECTURE.md:1-17`)
2. **Executable law:** the current TypeScript engine, Rust laws crate, reducer,
   CLI, and blocking parity harness. (`AGENTS.md:20-45`;
   `ci/oracle-crosscheck.mjs:1-20,610-612`)
3. **Python oracle, only where the harness invokes it:** the oracle is primary
   evidence for the tested shape mathematics, not blanket authority for all of
   its legacy domain rules. The harness explicitly registers owner-adjudicated
   validation forks. (`ci/oracle-crosscheck.mjs:317-321,369-387,417-467`)
4. **Historical artifacts:** archived specs, prototypes, simulations, Git
   history, transcripts, and NotebookLM explain provenance, unsynthesized
   components, and rejected alternatives; they do not override current rulings.
   (`docs/CANON-LEDGER.md:31-32,127-130`)

This report accompanies the implementation changes it describes. Because active
work is in progress, “current” below means the filesystem state on the snapshot
date rather than an immutable release tag.

## Artifact inventory

### A. Current canonical and executable artifacts

| Artifact | Role in the current system | Authority |
|---|---|---|
| `docs/CANON-LEDGER.md` | Fifteen recurring owner rulings, plus the explicit surface/fingerprint decision and drift log. (`docs/CANON-LEDGER.md:15-33,76-132`) | Highest owner-adjudicated record |
| `docs/SPEC-ZONE-ARCHITECTURE.md` Part A | v3.1 domain specification: 2D-Net, Space/Structure hierarchy, validation, side-tape, tools. (`docs/SPEC-ZONE-ARCHITECTURE.md:13-28,83-125,146-163`) | Canonical blueprint |
| `engine/core/block-node.ts` | Reciprocal six-neighbor graph and flood-fill implementation. (`engine/core/block-node.ts:80-101,149-164,243-287`) | Executable graph law |
| `engine/space-shape.ts` | One public shape seam: clusters, missing-handshake faces, compact token, typed surfaces, wall projection, walkability, and two distinct fingerprints. (`engine/space-shape.ts:90-407,494-711,781-803`) | Executable projection law |
| `engine/space-gate.ts` + `engine/core/validation.ts` | Maps a saved Space payload into the graph and applies the publish/save rules. (`engine/space-gate.ts:29-60`; `engine/core/validation.ts:274-374,386-420`) | Canonical TS gate |
| `engine/space-spine.ts` | Derives one max-corner side-tape and bottom-up floor order from Structure rows. (`engine/space-spine.ts:1-15,38-88`) | Current vertical-travel law |
| `engine/scene-codec.ts` | Single TypeScript reader/writer for the editor's six-face-slot RLE scene stream. (`engine/scene-codec.ts:1-9,17-84,87-100`) | Frozen scene seam |
| `spacetime/laws/src/lib.rs` | Pure Rust mirrors for walls, walkable surfaces, side-tape landings, and handshake fingerprint. (`spacetime/laws/src/lib.rs:101-174,215-292,301-337`) | Reducer-side math twin |
| `spacetime/src/lib.rs` | Server-authoritative persistence and derived rows: shell, walkability, door links, fingerprint, and rides. (`spacetime/src/lib.rs:468-539,566-665,669-782,1198-1267`) | Runtime authority |
| `ci/oracle-crosscheck.mjs` | Blocking anti-drift proof across Python, TS, Rust, reducer/CLI projections on odd shapes and rule edges. (`ci/oracle-crosscheck.mjs:22-71,88-168,170-315,317-468,470-607`) | Evidence gate |
| `engine/shell-view.ts` | Separates the city/Zone exterior box view from NESWUD shape truth. (`engine/shell-view.ts:1-20,43-79`) | Executable index-view law |

### B. Direct ancestors and simulators

| Artifact | What it contributes | Status |
|---|---|---|
| `[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md` | Executable early 9-bit net: four horizontal bits, two two-bit vertical flags, mutual connector BFS. (`:18-66,84-122`) | Historical predecessor |
| `[local archive]/user/github/hubzz/simulators/neswud-voxel-engine` | Primary March 2026 simulator. It made the planar proposal operational as a reciprocal six-neighbor graph, tested connected components, rendered missing neighbors as exterior faces, and explored typed/passable interfaces, caching, spawning, hollow-air detection, movement, and teleportation. (`README.md:1-37,153-205`; `src/core/block-node.ts:79-137,216-259`; `tests/core.test.ts:58-186`) | Direct code and design ancestor; mixed retained and superseded experiments |
| `[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/space-rendering.ts` | Early face/interface experiment: missing neighbor → exterior wall surface; interface element → typed, collidable/passable surface. (`:230-269,318-355,386-409,439-472`) | Conceptual precursor; renderer was a skeletal prototype, not current runtime |
| `[local archive]/user/github/spatial-mapping/spatial-mapping/docs/documentation-audit.md` | February 2026 synthesis of the original net, Python engine, face classifier, fingerprint, validators, editor split, and economic constraints. It records rationale but also describes then-current drift. (`:21-23,55-105,109-203`) | Historical design audit, not current authority |
| `[local archive]/user/github/spatial-mapping/spatial-mapping/docs/local-sync-architecture.md` | March 2026 draft explaining why a flood-filled Space is also a subscription/rendering/security boundary and proposing the SpacetimeDB spine. (`:1-22,26-72,90-109`) | Architectural rationale; roadmap portions are aspirational and its old traversal types are superseded |
| `[local archive]/user/github/spatial-mapping/spatial-mapping/docs/spatial-mapping-outline.md` | Frontend storage and 4-neighbor, same-kind clustering model. (`:44-92,96-154`) | Historical UI implementation; same-kind survives, but current skin upgrades it to six-neighbor 3D flood-fill |
| `[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/geometry_utils.py` | Face-explicit “Jack” experiment: six direction points, absent-neighbor faces, inner/outer void classification, ordered face hashes, mesh generation. (`:15-27,48-98,117-176`) | Current oracle checkout, but only some functions are canonicalized by parity |
| `[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/models.py` | Bounding boxes, visible shell extraction, bottom-up manifest, and original position-absolute handshake SHA-256. (`:43-71,121-168`) | Mixed-generation Python model; fingerprint bytes remain authoritative through M8 |
| `[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/utils.py` | Region-aware six-direction flood-fill. (`:8-52`) | Oracle ancestor retained |
| `[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py` | Early architectural, door-gap, walkability, and reachability experiments; now also contains a campaign-era side-tape amendment. (`:6-131,133-230,266-308`) | Mixed/stale domain rules; M5 explicitly arbitrates forks |
| `[local archive]/.codex/attachments/4c42ef7a-f67d-4b9a-8422-4a967bd8a2b2/pasted-text.txt` | The 1,163-line Python file the owner asked “is this the system?” It concatenates the older config/model/validators/manager/runtime: exposed-voxel shell reduction, absolute handshake SHA-256, inferred doors, exact allocation, same-kind compilation, old traversal kinds. (`:31-97,99-178,205-318,466-573`) | **Not the current system as a whole**; same-kind grouping, the fingerprint, and several validators are ancestors, while current ledger/harness overrule the stale mechanisms |
| `[local archive]/src/github.com/russfranky/spatial_mapping` | The skin/reference UX and Python simulator entered together in commit `16029476` (2026-02-16); the Zone Builder validation arrived in `268bcf79` (2026-02-20); cluster logic was extracted in `d83709f8` (2026-03-21); canonical engine rendering was grafted in `bfa04a38` (2026-07-20). Current source imports the engine rather than owning a parallel shape law. (`[local archive]/src/github.com/russfranky/spatial_mapping/src/app/zone/validation.ts:1-48`; `[local archive]/src/github.com/russfranky/spatial_mapping/src/components/zone/three/clusters.ts:1-55`) | Design source and skin; not an independent authority |

### C. Research corpus and archives

The archive at
`[local archive]/Documents/Archives/Code_Snapshots/_archive/hubzz-neswud-concept/`
is the most useful consolidated provenance bundle. Its 2D-Net document records
the planar token model and mutual connectors (`Documentation/technical-implementation/2d-net-driven-architecture.md:7-31`), while the archived prototype preserves the graph/interface implementation that became the present engine
(`packages/voxel-engine-prototype/src/core/block-node.ts:79-137,216-259`).
The archived prototype's README, core graph, renderer, historical spacing model, validation,
teleportal, constants, and core tests are byte-for-byte copies of the owner-supplied
simulator under `[local archive]/user/github/hubzz/simulators/neswud-voxel-engine`;
the `/Volumes` copy is therefore used as the primary simulator citation here.

The `Hubzz_MasterDocs` corpus contains earlier/larger product and formalization
passes. It is valuable for intent and experiment chronology, but several files
describe proposals that were never adopted or were later overruled. For example,
the October 2025 reference implementation numbers directions as
NORTH=0, SOUTH=1, EAST=2, WEST=3, UP=4, DOWN=5, not the doodle's 1–6 order;
therefore numeric face order is demonstrably not a stable invariant.
(`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:23-40`)

The corpus also contains a useful warning against treating a document labelled
“formal” as a completed proof. One reference defines its expected storage size
from `width × height × 9` and then verifies that same definition, while its Rust
sample says complete vertical replication is not implemented and `get_cell_3d`
does not use `z`; its conclusion is conditional on tests that its own next-steps
section still asks the reader to run.
(`[local archive]/Downloads/Hubzz_MasterDocs/2D-Net Reference Implementation Executable Validat 8fd512787a36471da7e96a1c703d6604.md:97-125,370-375,450-468,861-892`)

The terminal transcripts and NotebookLM are useful indexes into this corpus but
are secondary. The ledger records why: prior sessions repeatedly introduced
phantom modules, wrong vocabulary, and over-broad interpretations.
(`docs/CANON-LEDGER.md:31-32,127-130`)

The named Grok handoff is not a recoverable research narrative. The file is a
96-line terminal screen capture showing a weekly-limit message, a reference to
the `/Volumes` spatial-mapping checkout, and status fragments; it contains no
NESWUD, bitmask, fingerprint, or implementation explanation. It tells us where
Grok was looking, not what it concluded.
(`[local archive]/Documents/Terminal Text/grok_spatial.txt:26-52,74-95`)

Three direct CLI queries against notebook
`50ffee5e-d967-4f3c-b02b-d3abec4ac5bf` make its limits concrete (conversation
`44f961f9-aa18-4ac1-b03f-c068865099f1`, queried 2026-07-20):

- Asked for an explicit 9-bit token source, it answered that the corpus contains
  none. Local MasterDocs do contain one, so the notebook is incomplete on the
  original encoding. (`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-66,84-86`)
- Asked for Jack/octahedron terminology, it found none; its NESWUD evidence came
  mainly from research session transcripts and later summary files, not the owner's
  doodle or Python face utility.
- Asked to audit fingerprint invariance, it found both position-invariant claims
  in transcripts/summary notes and a position-absolute claim in `kimi_bs.txt`.
  Current code resolves that conflict in favor of an absolute persisted SHA-256
  plus a distinct invariant `netFingerprint`. (`engine/space-shape.ts:148-232`)

The `[local archive]/user/github/spatial-mapping/spatial-mapping/docs` history is a
particularly useful timestamped bridge. The comprehensive audit entered with the
Python/front-end integration on 2026-02-16 (`16029476`), the localized-sync draft
on 2026-03-11 (`38849f5c`), its SpacetimeDB detail on 2026-03-12 (`15dd42eb`),
and the docs-directory reorganization on 2026-03-21 (`ec034b41`). The audit calls
Python the then-canonical server truth, while the sync document labels itself a
draft and ends with an implementation roadmap; both are historical evidence,
not evidence that every described reducer or view was built.
(`[local archive]/user/github/spatial-mapping/spatial-mapping/docs/documentation-audit.md:1-23`;
`[local archive]/user/github/spatial-mapping/spatial-mapping/docs/local-sync-architecture.md:1-7,104-109`)

The image-only NotebookLM PDF is likewise intent evidence. Page 3 presents the
Zone/Space hierarchy and three access categories (with an older label attached
to flex); page 4 markets the 2D-Net as a surfaces/connectivity fingerprint; page
5 presents an automated building-code gate. It supplies no executable method or
text layer and therefore does not outrank the sources behind it.
(`[local archive]/Downloads/Hubzz_The_Spatial_Web.pdf:pages 3-5`)

The September 2025 architecture PDF is the clearest prose source for the
bottom-up train. Page 4 defines N/E/S/W plus vertical-state tokens, repetition
for uniform stacks, linked nets for changing footprints, flood-fill
reconstruction, and bottom-up priority; page 5 says the train joins floor and
ceiling footprints of adjacent Spaces. Its physical partition-gap sections are
explicitly superseded and are not used here.
(`[local archive]/Downloads/Hubzz Zone-Based Architecture (1).pdf:pages 4-5`)

`Dev_Handoff.pdf` is primarily a platform/database handoff. It corroborates the
Zone → Structure → Space hierarchy and the closed `public/private/flex` kind
set, but it neither specifies nor implements the NESWUD train. Its inherited
partition-gap measurement is historical.
(`[local archive]/Downloads/Dev_Handoff.pdf:pages 2-4`)

## The evolution in detail

### 1. Planar connector tokens: the compact authored layer

The earliest clearly executable formulation was not “store six faces per
voxel.” It was a 2D cell with a presence bit, four horizontal connector bits,
and vertical continuation/termination state. Traversal required complementary
declarations at both ends and used a visited set/BFS.
(`[local archive]/Documents/Archives/Code_Snapshots/_archive/hubzz-neswud-concept/Documentation/technical-implementation/2d-net-driven-architecture.md:7-31`;
`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-66,88-122`)

The durable idea was **local connection state**, and the compact packing remains
a legitimate unsynthesized component. The most explicit Python model counts nine
bits as presence + four horizontal booleans + two 2-bit vertical states. A related
TypeScript schema records an eight-position `N,E,S,W,PLUS,V1,V2,R` layout, while
its runtime graph models all six neighbor directions directly.
(`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-66,84-86`;
`[local archive]/Documents/Archives/Code_Snapshots/_archive/hubzz-neswud-concept/packages/voxel-engine-prototype/src/core/constants.ts:126-173`;
`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/block-node.ts:79-137`)

The research does not yet give one byte-compatible vertical encoding. The prose
needs independent three-state up/down termination, the “verified” class logically
allocates two bits to each, but the eight-position layout has only `V1,V2,R` for
all vertical/termination information. Moreover, the executable reference's
`get_cell(x,y)` has no layer argument even while reconstruction changes `z`.
These are specification seams to settle with fixtures before adopting a packed
wire—not reasons to discard the bitmask concept.
(`[local archive]/Downloads/Hubzz_MasterDocs/2d_net_architecture.md:7-20,30-48`;
`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-78,88-136`)

The persisted scene still takes the full-fidelity route: it stores sparse 3D solids in an
RLE stream over six renderer face slots, reconstructs the graph from occupied
positions, and keeps interfaces alongside the voxel stream. That already handles
non-uniform stacks, overhangs, mezzanines, and courtyards. It does **not** yet
express the original 9-bit token/vertical repetition as the canonical compact
form or fingerprint input.
(`engine/scene-codec.ts:1-9,17-100`; `engine/space-shape.ts:90-145,183-232`)

The in-progress engine now supplies that missing compact form in TypeScript as
`NT1`: bits 0–3 N/E/S/W, bit 4 presence, bits 5–6 Up state, and bits 7–8 Down
state. Consecutive layers with the same exact footprint become one run with a
repetition count; each distinct horizontal island has one origin and BFS-ordered
tokens packed nine bits back-to-back. Decode rejects dangling/non-reciprocal
connections and invalid vertical attachments. The CLI proves reconstructed
blocks produce the pre-existing oracle fingerprint. A 48-block L-shaped room
occupies 69 bytes, while an 8×8×32 uniform tower stores one 64-cell footprint in
91 bytes. This is the first executable synthesis, not yet the saved scene wire.
(`engine/space-shape.ts:282-515`; `ci/engine-checks.mjs:228-260`;
`cli/src/hubzz.ts:376-427`)

### 2. Graph prototype: Space becomes connected component

The owner-supplied TypeScript simulator replaced implicit probe choreography with a
general block graph. Adding a link validates geometry and writes the reciprocal
opposite; `autoLinkBlock` discovers all occupied unit neighbors; flood-fill
returns connected components.
(`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/block-node.ts:79-100,122-137,216-259`)

That mechanism is retained essentially verbatim in today's graph. The public
shape seam deduplicates cells, maps network-lab's axes into the graph, runs the
auto-link pass, asks for connected components, and emits a face for every missing
neighbor.
(`engine/core/block-node.ts:80-101,149-164,243-287`;
`engine/space-shape.ts:95-145`)

This is why “a Space is the flood-fill” is more than an implementation choice:
all downstream facts share the same component boundary. Odd shapes need no new
algorithm. (`docs/CANON-LEDGER.md:8-10,26-29`)

The simulator also explains *why* the graph survived. Its spawn demo begins at
one block and treats the flood-filled component as everything reachable from
that entry; its cache stores block membership, reachability, spawn points,
validation, and navigable volume, then invalidates or incrementally updates that
projection when topology changes.
(`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/examples/spawn-flood-fill-demo.ts:121-175,180-240`;
`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/space-cache.ts:1-5,14-79,118-205,244-260`)

The owner additionally confirmed that a URL may name an air cell above the
structure. That coordinate is a probe: scan Down in the requested column to the
first standable Up-facing floor; nearest-column relocation is only the fallback
when that ray has no eligible floor. This pass removed the TypeScript
`SpawningSystem`'s proximity precheck, authored `walkableTop` dependency, and
arbitrary 20-block cap. The reducer now preserves every standable level as one
64-bit mask per column in additive `space_standable` derived state; `ready`
selects the highest eligible bit at or below the requested height. The frozen
`space_walkable` grid continues to hold the lowest surface for normal movement.
(`engine/core/spawning-system.ts:123-330`; `spacetime/laws/src/lib.rs:152-250`;
`apps/world-client/src/core/App.Core.ts:33-48`; `spacetime/src/lib.rs:148-171,820-870,925-970`)

The later localized-sync draft generalizes the same boundary: subscribe to the
occupied Space and visible adjacent Spaces, instantiate only their meshes, and
withhold locked/distant private data from the client. Its implementation plan
explicitly proposes SpacetimeDB queries and reducers keyed by Space identity.
(`[local archive]/user/github/spatial-mapping/spatial-mapping/docs/local-sync-architecture.md:11-22,26-72,104-109`)

The NotebookLM video visualizes this product rationale rather than proving new
shape math: at approximately 02:20 it changes from rooms to a graph, around
02:40 the flood highlight stops at locked faces, around 03:20 it separates the
user view from server logic, and by 04:00 it returns to the 64×64 world view.
(`[local archive]/Downloads/Virtual_Architecture_and_the_Flood-Fill_Algorithm.mp4:02:20-04:00`)

### 3. Jack/six-point reframing: preserve the face address

The January/February Python generation introduced a second useful representation:
`DIRS` is a map of six named unit vectors; `faces_for_space` emits one row for
every `(voxel,direction)` whose neighbor is absent. `classify_faces` flood-fills
the surrounding void to distinguish faces looking outward from faces enclosing
an internal cavity. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/geometry_utils.py:15-27,48-98,117-124`)

That is the valuable part of the Jack/octahedron doodle: a block that is merely
marked “visible” is insufficient because a corner block may expose several
different faces. The same Python checkout demonstrates the loss and the remedy:
`Space._optimize()` reduces the result back to a set of shell **voxels**, whereas
`faces_for_space()` retains each direction independently.
(`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/models.py:43-58`;
`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/geometry_utils.py:117-124`)

The doodle's `EE = Ø` notation is consistent with—but does not independently
define—the implemented cancellation rule: reciprocal adjacency occupies the
shared interior, so neither side is emitted as a boundary face; only an unpaired
direction slot survives in `faces`.
(`engine/core/block-node.ts:80-101`; `engine/space-shape.ts:112-123`)

The current `BoundaryFace {x,y,z,dir}` and `typedBoundaryFaces` preserve the
face-explicit form. A Door or Window changes `type` at the exact address; the
returned list remains one-for-one with the missing-handshake boundary.
(`engine/space-shape.ts:34-40,665-681`)

The owner further clarified the intended use as a “Battleship” surface map:
the fingerprint identifies the Space/net, `{cell,dir}` deterministically selects
one of its surfaces, and a small face-local `(u,v)` locates an item on that
surface. This explains why reducing to “shell voxel visible” was never enough:
placement needs the direction to survive, while UV/material/asset data can stay
a projection rather than changing connectivity. The current exact boundary-face
door anchor is already an instance of that addressing model; generalized local
UV placement is a remaining synthesis surface.
(`engine/space-shape.ts:34-40,665-711`;
`apps/space-editor/src/tools/EditorToolDoor.ts:172-219`)

The doodle's numbering/order should **not** be serialized as canon. Historical
sources disagree on order, and the adopted handshake byte stream deliberately
uses the oracle's `E,W,N,S,U,D` append order. Direction letters and reciprocal
pairing are the invariant.
(`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:23-40`;
`engine/space-shape.ts:183-216`)

### 4. Surfaces and interfaces: from gaps/deletions to typed faces

The TypeScript simulator already contained the important distinction:
an absent neighbor generated an exterior wall surface, while an interface element
generated a typed surface whose collidability depended on its type; Doors were
passable. (`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/space-rendering.ts:230-269,318-355,386-409`)

Its exact mechanism was still experimental: typed elements lived in the physical
gap *between linked blocks*, while an unlinked direction automatically became an
exterior wall. Current law retains only the typed-face idea at exact boundary
addresses. The owner explicitly superseded both the physical gap and the later
1/8-meter decor-band interpretation with simple two-sided texture mapping. The
latest concrete storage fields for that mapping have not yet been identified;
older six-side fields are not treated as canonical by inference.
(`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/space-rendering.ts:242-315`;
`docs/SPEC-ZONE-ARCHITECTURE.md:66-75`; `engine/space-shape.ts:665-711`)

Later Python validation regressed doors into inferred holes: it searched for
ground perimeter voxels with no block above, grouped those gaps, and required
exactly one for Private. That experiment is retained only as historical evidence.
(`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:49-131`)

The owner adjudicated the conflict on 2026-07-17: a cut is a **surface absence,
not voxel absence**, every face is typed, and a Door is a first-class passable
surface. The apparent phrase “deliberately broken handshake” means “this boundary
slot is not an ordinary wall,” not “delete its address from the surface map.”
(`docs/CANON-LEDGER.md:76-89`; `engine/space-shape.ts:644-711`)

There are consequently two projections of the same authored interface:

- `typedBoundaryFaces`/`interfaceFaces` preserves wall/door/window surface type
  for rendering and interaction. (`engine/space-shape.ts:665-711`)
- `synthesizeShellWalls`/Rust `shell_wall_cells` omits wall **solids** in the
  opening span so collision/walkability has a passage, while keeping the typed
  face in the interface map. (`engine/space-shape.ts:601-638`;
  `spacetime/laws/src/lib.rs:101-148`)

This resolves the seeming contradiction between “a Door is not a hole” and the
wall stamper having a cutout: it is not a hole in semantic surface identity; it
is a cut in the wall-solid projection.

### 5. Bounding boxes: retained as indexes, rejected as geometry

The Python experiments found a useful optimization: compute a box, retain
surface voxels, and sort compiled Spaces by `min_z` for bottom-up rendering.
(`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/models.py:43-71,161-168`)

Some simulator variants then overextended the optimization. For example,
`Space.from_bounds()` synthesized a complete rectangular shell and lazily
regenerated every voxel from dimensions.
(`[local archive]/Downloads/Zone-Docs/zone_engine/models.py:48-123`)

That shortcut fails on L, U, T, courtyard, and disconnected shapes, so the owner
rejected it. Current law is explicit: the box is the city/Zone marker,
subscription/intersection index, and structure/elevation aid; it is never expanded
to supply missing scene geometry. (`docs/adr/0002-neswud-boundary-not-box.md:5-15`;
`engine/shell-view.ts:1-20`; `engine/space-shape.ts:710-720`)

The owner clarified that the “train upward” path is specifically an outside-view
streaming optimization: looking from zone to zone or standing in a zone's
unassigned remainder loads lightweight exterior surfaces, then trains exact
Spaces bottom-up through advertised bottom/top attachment footprints. Entering a
Space switches to its full scene. All unassigned Zone allocation belongs to one
computed Public remainder Space. Its Public classification preserves the Zone
owner's normal item-placement rights, and its Zone-wide envelope avoids imposing
an authored-room height ceiling on large items. `exterior` is only the current
view/streaming tag, not a fourth kind or the source of those permissions.

The newly recovered simulator specification names the publish rule directly:
`UNDEFINED` is temporary and defaults to `PUBLIC`. Its executable example also
requires the finite district allocation to be fully used before publish. That
source's `_compile_spaces` prototype flood-fills same-label voxel clusters, but
the owner's current ruling is more specific for the unassigned Zone remainder:
one Public allocation/placement context. The prototype therefore supports the
type and allocation semantics, but does not overrule the singular current model.
(`[local archive]/Documents/HUBZZ/intake/takeout-extracted/Takeout/NotebookLM/Hubzz_ Simulator/Artifacts/Metaverse Zone Engine_ Architectural Specificati.md:8-25`;
`[local archive]/Documents/HUBZZ/intake/takeout-extracted/Takeout/NotebookLM/Hubzz_ Simulator/Sources/MetaverseZoneEngine.html:2`)

A recovered September 2025 design transcript supplies the missing intent behind
the singular container: “outdoor” meant any leftover Space not made part of
another Space, **not literally outdoors**. The discussion explicitly contrasts
authored Space height caps with the unrestricted shared Public remainder. This
is why the implementation must not infer outdoor geometry or a new kind from
the `exterior` streaming tag.
(`[local archive]/Documents/HUBZZ/intake/takeout-extracted/Takeout/NotebookLM/Forging Virtual Worlds_ Team, Tech, and Vision/Sources/Meeting started 2025_09_08 13_41 UTC - Notes b.html:166`)

The original private `HubzzHQ/network-lab` repository confirms which pieces were
actually built. Its world client requests a 3×3 zone neighborhood around the
player with at most three parallel loads; the server's network tile request
defaults to `loadOnlyExternal=true`, while `getSpace` is a separate full-space
path. Those files survive essentially unchanged in this repo's legacy apps. The
zone builder, however, only left a comment promising to fill areas with no Space,
and its load path skips `spaceId === -1`; the computed exterior remainder and
bottom/top train scheduler were not completed there. The current engine's
`buildDefaultPublicSpace` is the salvage point and returns one Public remainder
plus the derived `exterior` view tag.
(`HubzzHQ/network-lab@009417a:world-client/src/managers/Environment.Manager.ts:28-94`;
`HubzzHQ/network-lab@009417a:server/src/managers/Environment.Manager.ts:117-154,423-432`;
`HubzzHQ/network-lab@009417a:zone-builder/src/core/Zone.Core.ts:25-58,146-150`;
`engine/core/space-builder.ts:1-145`)

Thus bottom-up ordering survives as a derived projection over exact Space scenes
and their interface footprints—not as license to reconstruct shape from boxes.
(`docs/SPEC-ZONE-ARCHITECTURE.md:21-29`; `engine/space-spine.ts:56-88`)

### 6. Walls: from authored rings and box hulls to graph projection

Historical simulators authored explicit wall voxels and inferred door notches by
deleting them. The Python stress simulation, for example, built full solid rooms
and skipped two wall voxels for a door.
(`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/tests/stress_test.py:7-20`)

The current division of labor is different. Zone Builder block footprint defines
the Space; the shell wall is derived from every missing horizontal handshake and
rises to the real per-column height; the Space Editor is for interior detailing
and typed outer-wall interfaces. (`docs/CANON-LEDGER.md:19-30`;
`engine/space-shape.ts:601-638`)

The 2026-07-17 parity campaign made this mechanically enforceable. The harness
uses boxes, L/U/courtyard/T/plus, and disconnected fixtures, then compares Python,
TS, Rust, and CLI outputs. (`ci/oracle-crosscheck.mjs:22-71,88-168,170-232`)

### 7. Walkability: derived from the same solids

The Python line established the retained principle: walkability requires support,
two cells of headroom, and BFS steps with vertical delta at most one.
(`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:133-182`)

Current law turns that into a deterministic 64×64 height grid: choose the lowest
level with a solid directly below and air at the level and one above; a step is
legal when the target is standable and height delta is at most one.
(`engine/space-shape.ts:781-803`)

The reducer derives and stores this grid during `save_scene`; it is not authored
or inferred from the box. (`spacetime/src/lib.rs:703-760`)

### 8. Vertical travel: from COLUMN Space to computed side-tape

The Python experiment introduced `SpaceType.COLUMN` and special reachability that
linked all Column Spaces. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/config.py:20-28`;
`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:184-220`)

The archived TypeScript prototype refined this into a one-to-many
`TeleportColumn` with a visible continuous interior column.
(`[local archive]/Documents/Archives/Code_Snapshots/_archive/hubzz-neswud-concept/packages/voxel-engine-prototype/src/core/teleportals.ts:31-49,89-129`)

That physical-column rule was superseded on 2026-07-17. A Structure is stacked
Spaces; stacking auto-derives one straight side-tape at the union box's max-x,
max-depth corner. The coordinate is a hint, and each floor lands on its nearest
standable base-level cell. (`docs/SPEC-ZONE-ARCHITECTURE.md:95-103,119-125`;
`engine/space-spine.ts:38-88`; `spacetime/src/lib.rs:1198-1249`)

The old `TeleportColumn` name remains inside generic engine types and comments,
but its physical/interior-column semantics do not override the side-tape wrapper
and reducer. (`engine/core/teleportals.ts:20-33`; `docs/CANON-LEDGER.md:33`)

### 9. Fingerprints: three experiments, two current identities

At least three fingerprint designs appear in the research lineage:

1. The early formal docs proposed RLE/Merkle encoding of the 2D net. That was a
   storage/on-chain integration design, not the fingerprint bytes currently
   persisted. It remains relevant to the missing compact synthesis.
   (`[local archive]/Documents/Archives/Code_Snapshots/_archive/hubzz-neswud-concept/Documentation/architectural-concepts/hubzz-technical-specification.md:19-21`)
2. The Jack-era Python geometry utility hashes ordered missing-face JSON, with an
   optional inner/outer classification. It is an informative experiment but is
   not the current stored fingerprint.
   (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/geometry_utils.py:126-156`)
3. Python `Zone.generate_fingerprint_hash()` serializes absolute coordinates and
   present-neighbor letters, prefixes Zone metadata, and SHA-256 hashes the bytes.
   The current reducer adopted this exact handshake stream.
   (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/models.py:121-154`;
   `engine/space-shape.ts:183-232`; `spacetime/src/lib.rs:725-779`)

The present system intentionally keeps three named identity layers:

- `netFingerprint`: translation- and quarter-turn-invariant shape/dedupe ID;
  mirrors remain distinct. (`engine/space-shape.ts:148-181`)
- `handshakeFingerprint`: position-absolute oracle-parity SHA-256 over raw local
  topology; moving one block changes the stream. It remains the independently
  pinned M8 base.
- `spaceSurfaceFingerprint`: saved, explicitly versioned `neswud2:` digest over
  the base hash plus sorted sparse `{x,y,z,dir,type,span,target}` surface records.
  Door, Window, and distinct DoorLink targets therefore differ without turning
  surface type into voxel occupancy. (`docs/CANON-LEDGER.md:90-103`;
  `engine/space-shape.ts:234-280`; `spacetime/laws/src/lib.rs:350-430`;
  `spacetime/src/lib.rs:805-850`)

Conflating them is a known corpus error. NotebookLM called the adopted SHA-256
fingerprint position-invariant; code and the ledger say the opposite.

There is a second, more structural mismatch. The current persisted fingerprint
does not hash packed 9-bit cells. `handshakeStream` builds a UTF-8 textual stream
from sorted absolute coordinates and the letters of present neighbors, then
SHA-256 hashes it. Conversely, the current scene wire stores renderer-oriented
six-slot values and derives those neighbor letters after decode. The result is
deterministic and parity-pinned, but the original “compact net is the binary
string” idea is only conceptually present, not codec-level integrated.
(`engine/scene-codec.ts:1-9,17-84`; `engine/space-shape.ts:183-232`;
`ci/oracle-crosscheck.mjs:544-607`)

### The synthesis seam, stated precisely

| Existing piece | What it already proves | What is not yet joined |
|---|---|---|
| 9-bit/token research + NT1 train tracer | Presence, N/E/S/W connector intent, independent Up/Down attachment state, repeated equal footprints stored once, multiple horizontal islands, and reciprocal exact round-trip. (`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-66`; `engine/space-shape.ts:282-570`) | Rust NT1 parity and use as the exterior-view streaming channel; it must not replace full saved interiors. |
| Current graph | Six-neighbor reciprocity and flood-filled components; the encoder consumes `computeSpaceShape` and the decoded blocks reproduce the existing fingerprint. (`engine/core/block-node.ts:80-101,149-164,243-287`; `ci/engine-checks.mjs:195-222`) | The saved editor scene still uses its inherited six-slot RLE rather than the token wire. |
| Jack/current boundary faces | Every missing handshake has an exact `{x,y,z,dir}` address and can be typed. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/geometry_utils.py:117-156`; `engine/space-shape.ts:665-711`) | Face type is stored beside the voxel RLE, not encoded into a unified compact net record. |
| Current scene codec | Byte-compatible persistence with the inherited editor and full-fidelity per-face material slots. (`engine/scene-codec.ts:1-84`; `apps/space-editor/src/scene/voxels/VoxelZone.ts:150-160,217-239,279-280`) | Six slots per cell are renderer/material storage, not N/E/S/W/U/D connector bits. |
| Current fingerprints | Oracle base provides position-absolute Python/TS/Rust/CLI parity; `neswud2:` adds typed-surface semantics with TS/Rust pinned bytes. (`engine/space-shape.ts:183-280`; `ci/oracle-crosscheck.mjs:544-607`) | NT1 is a view codec, so the semantic identity intentionally commits decoded topology + surfaces rather than coupling identity to one streaming encoding. |

A synthesis should therefore reuse these laws and make the transformations
explicit—token/scene → solids → reciprocal graph → unpaired typed faces → the
persisted fingerprint—rather than adding another flood-fill, face pass, or hash.
That direction follows the repository's frozen seams and “no handrolling” rule.
(`AGENTS.md:65-68`; `docs/CANON-LEDGER.md:8-10,90-103`)

### 10. Save vs publish and the shared spine

The original Python README already separated large off-chain data from an
on-chain fingerprint and described publishing Zones.
(`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/README.md:1-13,51-57`)

The current vocabulary makes the boundary precise: save a Space's validated,
off-chain `space_scene`; publish a Zone fingerprint on-chain. A future furnished
Space asset is explicitly out of scope.
(`docs/adr/0007-save-space-publish-zone.md:5-38`)

SpacetimeDB is the shared spine: `space` holds index boxes, `space_scene` holds
saved detail, and Space instances subscribe by `space_id`.
(`docs/adr/0001-spacetimedb-spine.md:5-14`)

One current gap remains visible in source: `save_scene` says the full validation
gate still runs client-side and will move into the reducer; today the reducer
itself rejects malformed/empty shape and derives runtime projections, but does
not yet execute the complete TypeScript gate atomically.
(`spacetime/src/lib.rs:669-686,703-724`)

## What was retained, superseded, or rejected

| Topic | Retained invariant | Superseded/rejected mechanism | Why/evidence |
|---|---|---|---|
| Shape | Six local neighbor relationships; reciprocal opposites; flood-filled Space. (`engine/core/block-node.ts:80-101,243-287`) | The mutually inconsistent 8-position/9-bit drafts as an unversioned runtime wire. | The versioned NT1 codec now proves a compact TS/CLI round-trip, but exact sparse scenes remain current semantic truth until Rust/reducer/exterior-loading parity exists. (`engine/space-shape.ts`; `engine/scene-codec.ts:17-84`) |
| Surface | Missing neighbor yields an exact face address. (`engine/space-shape.ts:112-123`) | “Exposed voxel” as sufficient shape output. | One voxel can expose several differently typed faces. (`engine/space-shape.ts:665-681`) |
| Doors/windows | Typed interface on exact boundary face; Door passable. (`engine/space-shape.ts:665-711`) | Inferring entries from grouped missing wall voxels. | It loses author intent, face direction, span, and target. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:81-131`) |
| Box | Index, exterior marker, intersection/stack/elevation helper. (`engine/shell-view.ts:1-20`) | Expanding min/max into floor, walls, collision, or metrics. | Over-covers odd shapes. (`docs/adr/0002-neswud-boundary-not-box.md:5-15`) |
| Walls | Derived from missing horizontal handshakes at real heights. (`engine/space-shape.ts:601-638`) | User-redrawn perimeter or box hull. | A second wall pass drifts from Space identity. (`docs/CANON-LEDGER.md:19-21`) |
| Walkability | Derived from solids, support, two-air headroom, step delta. (`engine/space-shape.ts:781-803`) | Authored tiles or box collision. | Reducer re-derivation keeps geometry/collision consistent. (`spacetime/src/lib.rs:703-760`) |
| Vertical travel | One-to-many floor menu, bottom-up order. (`engine/space-spine.ts:56-88`) | `COLUMN` Space / required continuous interior column. | The old validation was redundant and rejected legal non-uniform stacks; side-tape + snap serves them. (`docs/CANON-LEDGER.md:33`; `.ralph/progress.md:814-833`) |
| Identity | Position-absolute handshake SHA-256 for persisted tamper evidence; invariant net ID for dedupe. (`engine/space-shape.ts:148-232`) | Face-JSON hash as current stored identity, or silently replacing the parity-pinned SHA-256 with net bytes. | RLE/Merkle remains an earlier integration direction; M8 pins today's oracle/TS/Rust/CLI bytes. (`ci/oracle-crosscheck.mjs:544-607`) |
| Space types | public/private/flex. (`docs/SPEC-ZONE-ARCHITECTURE.md:85-94`) | `COLUMN` and other retired kind labels. | Vertical travel is derived; owner explicitly ruled flex vocabulary. (`docs/CANON-LEDGER.md:24,33`) |

## Contradiction register

These are not unresolved design choices unless noted; they are places where the
corpus contains overlapping generations.

1. **“A cut is a hole” vs typed surface.** Python door validation and wall-solid
   projection use absence, but semantic interface truth retains Door/Window type.
   Current ruling: typed surface wins. (`docs/CANON-LEDGER.md:81-89`)
2. **“Shell is the box perimeter” vs flood-fill wall.** ADR 0003 still says “box
   perimeter” in places, while ruling #2 and executable law use the exact
   footprint boundary. Read ADR 0003's user-workflow decision, not its stale box
   wording. (`docs/adr/0003-shell-is-the-outer-wall.md:5-14`;
   `docs/CANON-LEDGER.md:20`; `engine/space-shape.ts:601-638`)
3. **“Single integrity column” in old data-model notes.** The SQL/data-model text
   still describes an interior column; Part A §5.1 and ruling #15 replace it with
   the computed side-tape. (`docs/SPEC-DATA-MODEL.md:146-153`;
   `docs/SPEC-ZONE-ARCHITECTURE.md:119-125`)
4. **`COLUMN` and Flex traversal trap in Python.** Both remain in historical
   validators; neither is current Space law. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/core/config.py:20-28`;
   `[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:196-215`; `docs/CANON-LEDGER.md:24,33`)
5. **Private exactly one door vs at least one.** Python requires exactly one;
   current kind law requires at least one entrance. M5 registers the two-door
   case as an owner-adjudicated fork. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:49-54`;
   `CONTEXT.md:45-49`; `ci/oracle-crosscheck.mjs:376-386`)
6. **Public must have a door vs opening optional.** Python rejects sealed Public;
   current TS treats it as a warning/legal case, explicitly registered in M5.
   (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:49-54`; `ci/oracle-crosscheck.mjs:376-386`)
7. **Uniform occupancy vs Flex 2×.** Python applies floor/4 to all kinds; current
   kind law doubles Flex occupancy, registered in M5. (`[local archive]/src/local/_non-git/Spatial_Mapping/zone_engine/validation/validators.py:56`;
   `CONTEXT.md:45-49`; `ci/oracle-crosscheck.mjs:381-383`)
8. **One fingerprint vs two.** NotebookLM and some docs conflate the invariant
   net ID with the absolute handshake SHA-256. Current code keeps both and names
   their roles separately. (`engine/space-shape.ts:42-48,148-232`)
9. **TeleportColumn as a typed face/current component.** NotebookLM and generic
   `InterfaceType` still list it; current Structure travel is computed side-tape,
   never authored on a face. (`engine/core/constants.ts:157-168`;
   `docs/CANON-LEDGER.md:33`)
10. **Numeric Jack order.** The doodle proposes one 1–6 order, an October 2025
    executable reference uses another 0–5 order, and the fingerprint uses
    E/W/N/S/U/D serialization. Numbers are mnemonic only.
    (`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:23-40`;
    `engine/space-shape.ts:189-216`)
11. **NotebookLM corpus incompleteness.** Its searches returned no
    Jack/octahedron source and did not surface the local 9-bit reference files;
    it consequently dismissed the compact-token line while also producing the
    fingerprint/TeleportColumn errors above. Local MasterDocs explicitly define
    the 9-bit cell, so notebook absence is not evidence of rejection.
    (`[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-66,84-86`)
12. **Partition-gap models are superseded by two-sided surface mapping.** The
    simulator treats 0.125m as real spacing, and a later spec revision recast it
    as a visual Albedo inset. The owner rejected both interpretations on
    2026-07-20 in favor of simple two-sided texture mapping at the exact face;
    no spacing, decor-band, occupancy, or collision rule is imported from them.
    (`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/constants.ts:20-30`;
    `[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/space-rendering.ts:242-315`;
    `docs/SPEC-ZONE-ARCHITECTURE.md:66-81`)
13. **Solid-component Space vs hollow-air Space.** The simulator first names
    connected solids Spaces, then adds a second engine that scans box interiors
    and creates Spaces from empty pockets. Current law retains the former only:
    a Space is the flood-fill over touching blocks. (`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/hollow-space-detection.ts:1-35,82-150,181-240`;
    `docs/CANON-LEDGER.md:8-10`)
14. **Authored walkability vs derived walkability.** The simulator exposes and
    tests `walkableTop` as a mutable block flag; current reducer computes the
    height grid from support and headroom whenever a scene is saved.
    (`[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/src/core/movement-system.ts:81-145`;
    `[local archive]/user/github/hubzz/simulators/neswud-voxel-engine/tests/core.test.ts:215-224`;
    `engine/space-shape.ts:781-803`; `spacetime/src/lib.rs:703-760`)
15. **Same-kind rule retained; 4-neighbor implementation and prose conflict.**
    The old UI outline groups horizontally adjacent same-kind columns. Current
    effective behavior first groups by kind and then calls the canonical 3D
    six-neighbor flood-fill, matching the owner/context definition of a Space.
    Part A's phrase “any cluster of touching blocks” omits that kind qualifier
    and should be read as stale/underspecified until the spec is corrected.
    (`[local archive]/user/github/spatial-mapping/spatial-mapping/docs/spatial-mapping-outline.md:108-154`;
    `[local archive]/src/github.com/russfranky/spatial_mapping/src/components/zone/three/clusters.ts:29-66`;
    `CONTEXT.md:39-49`; `docs/SPEC-ZONE-ARCHITECTURE.md:83-94`)
16. **Localized-sync principle vs its old traversal graph.** Subscribing by
    current/adjacent Space is retained architectural rationale, but the draft's
    one-way Flex trap and remote `COLUMN` network describe superseded Python
    rules. Current travel is the side-tape and current Flex is not a trap.
    (`[local archive]/user/github/spatial-mapping/spatial-mapping/docs/local-sync-architecture.md:78-100`;
    `docs/CANON-LEDGER.md:24,33`)
17. **Handshake rationale overclaim.** The historical audit says identical voxel
    positions could have different internal connections. In the adopted law,
    handshakes are auto-derived from occupancy at exact unit offsets; identical
    positioned solids therefore produce identical adjacency. The persisted hash
    still usefully commits to occupancy/topology bytes, but it is not evidence of
    separately authored hidden links.
    (`[local archive]/user/github/spatial-mapping/spatial-mapping/docs/documentation-audit.md:81-105`;
    `engine/core/block-node.ts:149-164`; `engine/space-shape.ts:183-232`)
18. **Historical interface-blind fingerprint gap — resolved.** The oracle base
    still commits to local solids independently, while saved `neswud2:` identity
    additionally commits to the canonical sparse typed-interface stream. Door,
    Window, and different DoorLink targets now produce distinct identities in
    TypeScript and Rust. (`engine/space-shape.ts:234-280`;
    `spacetime/laws/src/lib.rs:350-430`; `spacetime/src/lib.rs:805-850`;
    `ci/engine-checks.mjs:196-227`)

19. **A face opening cannot erase a whole corner wall cell.** Current typed
    interfaces correctly retain `{x,y,z,dir}`, but the legacy wall-voxel
    projection removes the entire synthesized wall cell when any one exposed
    face is opened. At an outside corner that can incorrectly remove collision
    for the other face. The semantic face stream is canonical; face-aware
    collision/render projection (or an explicit validation restriction) remains
    required before corner openings are end-to-end correct.
    (`engine/space-shape.ts` `synthesizeShellWalls`, `interfaceFaces`)
20. **Vertical typed faces are fingerprinted but not fully presented.** `U` and
    `D` are valid typed-interface directions and participate in `neswud2`, while
    the current Dollhouse/interface rendering path consumes horizontal faces.
    This is an explicit consumer gap, not permission to discard the vertical
    interface from identity. (`engine/space-shape.ts`; `apps/world-client/src/spatial/Dollhouse.ts`)

## Why the current rulings are reasonable consequences of the research

The present architecture is not a rejection of the original work. It is a
conservative implementation of pieces that survived every simulator, with the
compact codec/persistence synthesis still outstanding:

- Local reciprocal adjacency makes shape reconstruction independent of entry
  point and naturally supports flood-fill. (`engine/core/block-node.ts:80-101,243-287`)
- Missing adjacency yields exact boundary faces for boxes and odd shapes alike.
  (`engine/space-shape.ts:112-145`)
- Retaining the face address lets one topology drive material, wall, Door,
  Window, collision, walkability, and later placement without parallel geometry
  models. (`docs/CANON-LEDGER.md:76-103`; `engine/space-shape.ts:665-711`)
- Keeping boxes as cheap indexes preserves bottom-up streaming and subscription
  efficiency without corrupting shape. (`engine/shell-view.ts:1-20`;
  `docs/SPEC-ZONE-ARCHITECTURE.md:21-29`)
- Deriving shell and walkability at save time prevents authored projections from
  disagreeing with the saved graph. (`spacetime/src/lib.rs:703-760`)
- The parity harness turns historical ambiguity into explicit, reproducible
  decisions rather than another prose interpretation. (`ci/oracle-crosscheck.mjs:1-20,610-612`)

## Best lightweight synthesis implied by the evidence

This is a reconciliation of existing components, not a new spatial model:

1. **Keep exact occupied cells as the semantic baseline.** The current graph and
   odd-shape behavior are proven. Any compact net must decode to the same solids
   before it can become authoritative. (`engine/space-shape.ts:90-145`;
   `ci/oracle-crosscheck.mjs:22-168`)
2. **Specify the token as local connector state.** Presence plus N/E/S/W and
   independent up/down continuation/termination must have one versioned byte
   layout. The conflicting 8-position/9-bit research layouts cannot be silently
   interchanged. (`[local archive]/Downloads/Hubzz_MasterDocs/2d_net_architecture.md:37-48`;
   `[local archive]/Downloads/Hubzz_MasterDocs/Python Reference Implementation (Verified) 7ae331df84de4c88b0b751338088c613.md:42-66`)
3. **Make reciprocity the decode invariant.** A directional bit only creates an
   edge when the neighbor has the opposite bit; a reciprocal shared face cancels
   from the boundary, and every unpaired slot becomes one addressable face.
   (`[local archive]/Downloads/Hubzz_MasterDocs/2d_net_architecture.md:33-35,50-56`;
   `engine/space-shape.ts:112-123`)
4. **Keep type as surface semantics, not topology deletion.** Door/Window/Wall
   overlays attach to the resulting face address. Renderer material values can
   remain a separate projection rather than masquerading as connector bits. A
   stable placement key should be the versioned Space fingerprint + exact cell
   coordinate + direction + face-local UV—not the BFS token ordinal, which is a
   wire traversal detail. This is the owner's “Battleship” surface-map intent.
   (`docs/CANON-LEDGER.md:76-89`; `engine/space-shape.ts:665-711`)
5. **Version the fingerprint seam and include interfaces.** Preserve the
   oracle-parity base hash over raw solids as an independently testable field.
   The implemented saved identity is a domain-separated/versioned digest over
   that base plus a deterministically sorted sparse typed-face overlay. It
   distinguishes Door from Window and DoorLink targets without collapsing surface
   semantics into synthesized wall occupancy. The `neswud2:` prefix prevents
   silent reinterpretation of existing bare hashes; TS/Rust pins keep
   M8's oracle base leg intact. (`engine/space-shape.ts:183-232,601-711`;
   `spacetime/src/lib.rs:703-779`; `ci/engine-checks.mjs:172-193`;
   `ci/oracle-crosscheck.mjs:544-607`)
6. **Prove vertical replication on the shapes the current scene already handles.**
   Uniform towers are the easy case; the deciding fixtures are changing
   footprints, cavities, overhangs, mezzanines, and disconnected components.
   Until those round-trip byte-for-byte, the exact sparse scene remains the safe
   semantic source. (`engine/scene-codec.ts:17-84`;
   `ci/oracle-crosscheck.mjs:22-71`)

## Integration boundary: proven now versus still unwired

The synthesis branch proves the reusable laws, codecs, and parity cases. It
does **not** yet make every projection an end-to-end product path:

- `buildDefaultPublicSpace` computes the owner's one large Public remainder,
  but Zone publish does not yet call it.
- NT1 round-trips in TypeScript/CLI with expansion and coordinate bounds, but
  is not yet a Rust/reducer persistence wire or the exterior loader.
- explicit `?space=` / `?structure=` URL coordinates reach `ready` and can fall
  from air using exact standable heights; a raw Zone coordinate still needs a
  Space-discovery resolver, and scenes saved before `space_standable` need a
  backfill/migration rather than the lowest-floor compatibility fallback.
- Dollhouse consumes exact saved cells and canonical horizontal interfaces,
  but corner-opening collision remains lossy at the old wall-voxel projection
  and vertical typed faces need a presentation/interaction consumer.
- the historical Zone Builder in the separate `spatial_mapping` repository
  still needs to rehydrate `space_scene` cells for block-resolved selection;
  outside/zone-to-zone display should continue using only lightweight boxes and
  the train.

These are separate wiring items because none requires inventing another shape
law. Each must consume the primitives above and add a gate that crosses its
actual product seam.

## Practical canon for future work

Use this compact test when evaluating another document, doodle, or simulator:

1. If it uses the compact token, does it decode unambiguously to one node per
   exact solid cell, including non-uniform vertical cases?
   (`[local archive]/Downloads/Hubzz_MasterDocs/2d_net_architecture.md:30-48`)
2. Does it preserve reciprocal N/E/S/W/U/D
   adjacency? (`engine/core/block-node.ts:80-101`)
3. Does it preserve every unpaired face as `{x,y,z,dir}`, even after typing it as
   Door or Window? (`engine/space-shape.ts:665-681`)
4. Does it derive Space, shell, walkability, dollhouse, and metrics from the same
   graph rather than expanding a box? (`docs/CANON-LEDGER.md:8-10`)
5. Does it keep `space` box/index separate from `space_scene` shape truth?
   (`CONTEXT.md:71-75`)
6. Does it save a Space and publish a Zone? (`docs/adr/0007-save-space-publish-zone.md:13-26`)
7. Does it treat Structure travel as the auto-derived max-corner side-tape, not
   an authored `COLUMN`? (`engine/space-spine.ts:38-63`)
8. Does it distinguish invariant `netFingerprint` from absolute persisted
   `handshakeFingerprint`? (`engine/space-shape.ts:148-232`)
9. Can the oracle/TS/Rust/CLI gate express and catch drift for the claim?
   (`ci/oracle-crosscheck.mjs:1-20`)

If an artifact fails a current-law check, it is historical input. If it supplies
a missing compact-codec component while preserving every current-law check, it
is an **unsynthesized source**, not a rejected idea. It becomes current canon only
after an owner ruling and executable cross-language parity case.
