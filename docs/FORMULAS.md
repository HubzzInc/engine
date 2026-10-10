# Settled formulas (with provenance)

## Handshake stream / fingerprint (canon, engine-parity)
stream  = concat over sorted present blocks: "0_0_<cx>_<cy>_<cz>:<letters>|"
          letters ∈ E,W,N,S,U,D for each PRESENT neighbor, that order.
fp      = sha256("<spaceId>-True-[]-" + stream)
saved   = "neswud2:" + sha256("NESWUD_SURFACE_V2|" + fp + "|" + typedSurfaceStream)
Position-absolute on purpose: move one block and the hash cascades
(tamper-evidence is the point — CANON-LEDGER:149).
Tower halls saved fp is PROVEN == engine (space-shape.ts) — docs/CANON-PARITY.md,
guarded by tests/test_canon_parity.py.

## Tones & tints (render only)
TONE per face direction: U 1.0 · N .85 · W .76 · S .66 · E .58 · D .48.
Per-surface grey step: multiplier 1.0 − 0.08·i per plane within a direction,
keyed (dir, plane coord) from the full shell (stable across views).
Walkable overlay color = brand mustard #E5B849 pre-blended 45% over floor
tone (alpha shader panics this Open3D build).

## Walkability
Viz overlay (owner-chosen): flood_fill from spawn seed over present
horizontal links of base blocks → interior floor tiles. Floodfill has NO
step/traversal logic; that belongs to the step gate.
Engine law (space-shape.ts:916): surface(x,z) = smallest y with solid at
y−1 and air at y and y+1; 0 = unwalkable; step legal iff |Δsurface| ≤ 1.
No floodfill in the law; walls need no special case.

## Ceiling-tops-as-walkable thread (owner-driven, parked)
floor := exposed U face (headroom check is vacuous under solid-stack
authoring). The floor map is already in the handshake: a block whose
letters lack U exposes a floor tile; stacking adds U and self-revokes.
Floor/ceiling are one surface read from two sides. Full six-step thread
with verbatim owner quotes: saved/2026-07-22-flat-tints/NOTES.md
(CIRCLE-BACK section).

## Wall surfaces
Walls have no thickness. A wall is the missing-handshake face on a solid block,
rendered as a surface, not a thick wall volume.

## NT1 bitmask wire (read-only in viz)
Source of truth: `network-lab/engine/space-shape.ts` (`nt1_*`) and
`network-lab/cli/hubzz bitmask --json` — both in this repo since the
consolidation (the old `HubzzHQ/network-lab-stdb` paths are retired).
This section documents that implementation; do not rederive or handwrite an
NT1 decoder in `viz/`.

The wire format below is enforced: `network-lab/ci/nt1-matrix.mjs` reads this
section as an INDEPENDENT decoder leg and asserts it byte-equal to the engine
and to the CLI, with tamper guards. If you change this spec, that gate fails.

NT1 is the compact exterior shape-detail codec (proof channel), not saved
interior shape truth and not a replacement for dollhouse `computeSpaceShape`
faces. Exterior/zone-to-zone loading is boxes-first; NT1 is consumed only when
shape detail is needed (canon: `--shape-detail`). Train cars are whole Spaces;
a single Space's repeated layers are codec storage detail. The codec stores
consecutive equal-footprint layers as runs. Each run stores its 2D floor shape
once, a repeat count, and packed 9-bit cell tokens.

Header:
bytes[0..2] = "NT1"; bytes[3..4] = minY i16 little-endian;
bytes[5..6] = runCount u16 little-endian.

Run:
u16 repeat; u16 componentCount.

Component:
i16 origin.x; i16 origin.z; u32 tokenCount; ceil(tokenCount·9/8) packed bytes.

Token:
word = N·2^0 + E·2^1 + S·2^2 + W·2^3 + PRESENT·2^4
     + Ustate·2^5 + Dstate·2^7.
U/D state: 0=connected, 1=hollow, 2=object-boundary, 3=reserved.
Packed bit formula: packed = tokenIndex·9 + bit; byte=floor(packed/8);
mask=1 << (packed mod 8).

Decode:
start BFS at each component origin; N/E/S/W bits enqueue neighbors; every
horizontal connector must be reciprocal; U/D states must match adjacent runs;
then emit `{x, y+dy, z}` for every dy in the run repeat. Final gate:
`computeSpaceShape(decoded).clusters.length == 1`.

Current viz role:
`solid` → axis map (viz z-up ↔ engine y-up) → `hubzz bitmask --json` → panel
values (`nt1 bytes`, `nt1 roundtrip`, `nt1 bit code`). Rendering still consumes
raw `solid`; NT1 must stay a proof/display seam unless the owner explicitly
promotes decoded solids as an input seam.

## Seams
seam(a,b) := surfaces share an edge whose adjoining faces differ in
direction — exactly the wireframe's edges. One derivation (`face_edges`)
feeds wireframe, wall surface flood, seam-survival, and support rules.

## Space types / kind colors
Space kind ∈ {PUBLIC, PRIVATE, FLEX}. The kind labels the WHOLE Space, not a
face or wall. Color reservations: purple=public, orange=private, green=flex.
These colors are space-level only. In this viz the sole kind-colored element is
the space-type panel label (`hubzz_viewer_gui.py` `type_colors`); the city-map
marker usage is the broader-system context, not present here. Dollhouse walls
stay neutral; mechanics and formula diagrams use charcoals/white/red.

## Structure side-tape / spine (canon)
"Structure" is reserved = stacked Spaces. Stacked belongs to the shell-view /
bounding-box system, not dollhouse shape truth. Spaces in a Structure connect
from the ground up as a grounded, contiguous vertical stack represented by
`space` row boxes. The exterior "train upward" loading projection is separate:
outside/zone-to-zone loading is boxes-first, lowest floor first (CANON-LEDGER
ruling 9, 2026-07-20); it is not the side-tape and not NT1.

Side-tape formula:
- exists iff a structure has at least two stacked Spaces;
- anchor = `(max(space.maxX), max(space.maxY))` over the whole structure box;
- floor directory = every stacked Space sorted by `(minZ, original row order)`;
- floor entry = `{spaceId, label, minZ}`;
- landings snap from the derived standable grid; the tape is a hint;
- no voxel, shaft, wall, or interior geometry is authored by this formula.

Box overlap formula for separate stacking:
`axisOverlap(a,b) := a_min <= b_max && b_min <= a_max`.
`boxesIntersect(a,b) := xOverlap && yOverlap && zOverlap`.
Same-zone published Spaces may not intersect. Two Spaces can share x/y
footprint only when their z intervals do not overlap.

NT1 train-car boundary:
NT1 train cars are whole Spaces. A standalone Space is one car. A single
Space's repeated layers are codec storage detail, not structure stacking.
Boxes are an index, never shape truth.
