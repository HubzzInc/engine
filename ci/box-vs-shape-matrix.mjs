// BOX-vs-SHAPE MATRIX — the gate for CANON-LEDGER ruling 10, "the box is an
// INDEX, never shape truth" (owner, 2026-06-09), and for the box-overlap rule
// the Python PoC settled (viz/docs/FORMULAS.md, "Box overlap formula for
// separate stacking" / viz/docs/ARCHITECTURE.md, "Published overlap guard").
//
// Why this file exists. The PoC's train-car panel drew each Space's bounding
// box next to its handshake wireframe, and the owner's correction is recorded
// verbatim in viz/saved/2026-07-22-pipeline-row/NOTES.md:
//
//     "The handshake creates the train's bounding boxes (exact shell extents,
//      no margin)."
//
// i.e. the box is a PROJECTION of the same handshake face set that produces the
// wireframe — never an independently-authored volume, and never a fill. Put the
// two side by side on a non-rectangular Space and they visibly disagree: the
// wireframe follows the notch, the box runs straight across it. This matrix
// makes that disagreement a NUMBER, on every shape family where box != shape,
// and pins the guard that stops overlapping boxes from publishing.
//
// The three claims it proves, per fixture:
//
//   COVER    the flood-filled cell count is STRICTLY LESS than the bounding-box
//            cell count (the box OVER-COVERS, so rendering the box would draw
//            solid where the Space has none — "box-fill"). Every shape cell is
//            inside the box, so the box is a strict superset: a legal INDEX,
//            an illegal RENDER.
//   BLIND    the box cannot tell the Space from its own hull. shellViewBox() of
//            the real footprint == shellViewBox() of the filled rectangle that
//            spans it, while computeSpaceShape() separates them by cell count
//            AND by boundary-face count (the faces the wireframe/seams are
//            derived from). Shape truth is the flood-fill; the box is an index.
//   SOURCE   shellViewBox is min/max over VOXELS (independently recomputed
//            here) and agrees with the single cluster's own bounds — but on a
//            DISCONNECTED payload it still returns one hull while
//            computeSpaceShape returns two clusters. The box does not know what
//            a Space is; only the flood-fill does.
//
// Then the overlap section proves the FORMULAS.md rule across three legs:
//   SPEC     axisOverlap / boxesIntersect transcribed literally from
//            viz/docs/FORMULAS.md — an independent reader, exactly like the
//            leg-2 decoder in ci/nt1-matrix.mjs. It exists to disagree with the
//            code if doc and code have drifted.
//   ENGINE   engine/core/validation.ts boxesIntersect (the TS law).
//   GATE     engine/space-gate.ts validateUploadedSpace({existingSpaces}) —
//            the shipping publish gate, which must raise SPACE_INTERSECTION on
//            exactly the intersecting cases.
//   REDUCER  a source pin on spacetime/src/lib.rs boxes_intersect + the call
//            sites (upsert_space, reached by commit_zone_draft). The reducer is
//            the last line of defense and cannot be linked from node, so its
//            formula and its wiring are pinned as text.
//
// Fixtures are DERIVED, never hand-typed: ci/fixtures/footprints.mjs (shared
// with ci/oracle-crosscheck.mjs) and ci/make-l-scene.mjs (the CC-03 L-shape
// truth fixture).
//
//   ./cli/node_modules/.bin/tsx ci/box-vs-shape-matrix.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { computeSpaceShape } from "../space-shape";
import { boundingBoxFromBlocks, boxSize, shellViewBox } from "../shell-view";
import { boxesIntersect } from "../core/validation";
import { validateUploadedSpace } from "../space-gate";
import { box, L, U, court, Tsh, plus, twoBoxes } from "./fixtures/footprints.mjs";
import { lFloorCells } from "./make-l-scene.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pad = (s, n) => String(s).padEnd(n);
let drift = 0;
let checks = 0;
const failures = [];
const mark = (name, check, ok, detail) => {
  checks++;
  if (!ok) { drift++; failures.push(`${name} [${check}] ${detail}`); }
  return ok;
};

// ── fixtures ────────────────────────────────────────────────────────────────
// footprint ([x,z] cells) x stack height -> solids {x, y=up, z=depth}.
const extrude = (footprint, height) =>
  footprint.flatMap(([x, z]) => Array.from({ length: height }, (_, y) => ({ x, y, z })));

const FIXTURES = [
  // control: box == shape. Proves the matrix can tell the two cases apart.
  { name: "rect-12x8 (control)", footprint: box(12, 8), height: 1, rectangular: true, clusters: 1 },
  // the CC-03 L-shape truth fixture, at its real zone coords (x16..27/z16..23)
  { name: "L-truth (CC-03)", footprint: lFloorCells().map(({ x, z }) => [x, z]), height: 1, rectangular: false, clusters: 1 },
  { name: "L-4-2", footprint: L(4, 4, 2, 2), height: 1, rectangular: false, clusters: 1 },
  { name: "L-16-8 tier-2", footprint: L(16, 16, 8, 8), height: 2, rectangular: false, clusters: 1 },
  { name: "U-16-6x8", footprint: U(16, 16, 6, 8), height: 1, rectangular: false, clusters: 1 },
  { name: "courtyard-14-4x4", footprint: court(14, 14, 4, 4), height: 1, rectangular: false, clusters: 1 },
  { name: "courtyard-5-1x1", footprint: court(5, 5, 1, 1), height: 1, rectangular: false, clusters: 1 },
  { name: "T-shape", footprint: Tsh(8, 4), height: 1, rectangular: false, clusters: 1 },
  { name: "plus-3 tier-4", footprint: plus(3), height: 4, rectangular: false, clusters: 1 },
  // disconnected: the box still returns ONE hull, the flood-fill returns TWO
  { name: "two-boxes (disconnected)", footprint: twoBoxes(), height: 1, rectangular: false, clusters: 2 },
];

console.log("\nBOX-vs-SHAPE — ruling 10: the box is an INDEX, never shape truth\n");
console.log(pad("FIXTURE", 26) + pad("SHAPE", 8) + pad("BOX", 12) + pad("BOXCELLS", 10) +
  pad("OVER", 7) + pad("BFACES", 8) + pad("CLUS", 6) + "VERDICT");

for (const f of FIXTURES) {
  const blocks = extrude(f.footprint, f.height);
  const shape = computeSpaceShape(blocks);
  const b = shellViewBox(blocks);
  const sz = boxSize(b);
  const boxCells = sz.w * sz.h * sz.d;
  const shapeCells = shape.blocks.length;

  // COVER — the box over-covers; every shape cell lies inside it.
  const inside = blocks.every((v) =>
    v.x >= b.minX && v.x <= b.maxX && v.y >= b.minY && v.y <= b.maxY && v.z >= b.minZ && v.z <= b.maxZ);
  const strictlyLess = f.rectangular ? boxCells === shapeCells : boxCells > shapeCells;
  mark(f.name, "COVER", inside && strictlyLess && boxCells >= shapeCells,
    `shape=${shapeCells} box=${boxCells} inside=${inside} rectangular=${f.rectangular}`);

  // BLIND — the hull that fills the box has the SAME box, a different shape.
  const hull = [];
  for (let x = b.minX; x <= b.maxX; x++)
    for (let y = b.minY; y <= b.maxY; y++)
      for (let z = b.minZ; z <= b.maxZ; z++) hull.push({ x, y, z });
  const hullBox = shellViewBox(hull);
  const hullShape = computeSpaceShape(hull);
  const sameBox = JSON.stringify(hullBox) === JSON.stringify(b);
  const shapeSeparates = f.rectangular
    ? hullShape.blocks.length === shapeCells && hullShape.boundaryFaces.length === shape.boundaryFaces.length
    : hullShape.blocks.length > shapeCells && hullShape.boundaryFaces.length !== shape.boundaryFaces.length;
  mark(f.name, "BLIND", sameBox && shapeSeparates,
    `sameBox=${sameBox} hullCells=${hullShape.blocks.length} vs ${shapeCells}, ` +
    `hullFaces=${hullShape.boundaryFaces.length} vs ${shape.boundaryFaces.length}`);

  // SOURCE — the box is min/max over voxels (recomputed independently here),
  // and it is NOT produced by computeSpaceShape: on the disconnected payload
  // it spans both clusters while the flood-fill reports two.
  const ind = blocks.reduce((a, v) => ({
    minX: Math.min(a.minX, v.x), minY: Math.min(a.minY, v.y), minZ: Math.min(a.minZ, v.z),
    maxX: Math.max(a.maxX, v.x), maxY: Math.max(a.maxY, v.y), maxZ: Math.max(a.maxZ, v.z),
  }), { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
  const isMinMax = JSON.stringify(ind) === JSON.stringify(b);
  const clustersOk = shape.clusters.length === f.clusters;
  // one cluster -> the cluster's own bounds must equal the box; many clusters
  // -> no single cluster covers the box (the box is an index across them).
  const clusterBoundsAgree = shape.clusters.length === 1
    ? JSON.stringify(shape.clusters[0].bounds) === JSON.stringify(b)
    : shape.clusters.every((c) => JSON.stringify(c.bounds) !== JSON.stringify(b));
  mark(f.name, "SOURCE", isMinMax && clustersOk && clusterBoundsAgree,
    `minmax=${isMinMax} clusters=${shape.clusters.length}/${f.clusters} clusterBounds=${clusterBoundsAgree}`);

  const rowOk = inside && strictlyLess && sameBox && shapeSeparates && isMinMax && clustersOk && clusterBoundsAgree;
  console.log(pad(f.name, 26) + pad(shapeCells, 8) + pad(`${sz.w}x${sz.d}x${sz.h}`, 12) +
    pad(boxCells, 10) + pad(boxCells - shapeCells, 7) + pad(shape.boundaryFaces.length, 8) +
    pad(shape.clusters.length, 6) + (rowOk ? "AGREE" : "DRIFT"));
}

// empty payload invents no box (shell-view.ts contract)
mark("empty", "NULL-BOX", boundingBoxFromBlocks([]) === null, "empty blocks must yield null, not an invented box");

// ── overlap: viz/docs/FORMULAS.md "Box overlap formula for separate stacking"
// SPEC leg, transcribed literally from the doc:
//   axisOverlap(a,b) := a_min <= b_max && b_min <= a_max
//   boxesIntersect(a,b) := xOverlap && yOverlap && zOverlap
// "Same-zone published Spaces may not intersect. Two Spaces can share x/y
//  footprint only when their z intervals do not overlap."
const axisOverlap = (aMin, aMax, bMin, bMax) => aMin <= bMax && bMin <= aMax;
const specIntersect = (a, b) =>
  axisOverlap(a.min.x, a.max.x, b.min.x, b.max.x) &&
  axisOverlap(a.min.y, a.max.y, b.min.y, b.max.y) &&
  axisOverlap(a.min.z, a.max.z, b.min.z, b.max.z);

// The candidate is a real gate-passing Space: 8x8 footprint, tier 2. Engine
// box coords are (x, y=depth, z=up) — space-gate.ts UploadSpacePayload.
const candidateBlocks = extrude(box(8, 8), 2);
const bb = (minX, minY, minZ, maxX, maxY, maxZ) => ({ min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } });
// candidate box in engine coords: x 0..7, y(depth) 0..7, z(up) 0..1
const CANDIDATE = bb(0, 0, 0, 7, 7, 1);

const CASES = [
  { name: "same footprint, z 0..3", other: bb(0, 0, 0, 7, 7, 3), expect: true,
    why: "same x/y AND overlapping z — the published-overlap guard must reject" },
  { name: "stacked above, z 4..7", other: bb(0, 0, 4, 7, 7, 7), expect: false,
    why: "separate stacking: shares x/y footprint, z intervals disjoint" },
  { name: "stacked above, z 2..5", other: bb(0, 0, 2, 7, 7, 5), expect: false,
    why: "z touches at the seam plane but does not overlap (1 < 2)" },
  { name: "stacked, z 1..5 (touch)", other: bb(0, 0, 1, 7, 7, 5), expect: true,
    why: "inclusive bounds: z=1 is shared, so the intervals DO overlap" },
  { name: "beside, x 8..15", other: bb(8, 0, 0, 15, 7, 1), expect: false,
    why: "disjoint on x alone is enough — no intersection" },
  { name: "beside, x 7..14 (touch)", other: bb(7, 0, 0, 14, 7, 1), expect: true,
    why: "x=7 shared: touching on all three axes IS intersecting (shared voxels)" },
  { name: "behind, y 8..15", other: bb(0, 8, 0, 7, 15, 1), expect: false,
    why: "disjoint on the depth axis" },
  { name: "engulfing, 0..15 cube", other: bb(0, 0, 0, 15, 15, 15), expect: true,
    why: "containment is intersection" },
];

console.log("\nBOX OVERLAP — FORMULAS.md axisOverlap/boxesIntersect vs the shipping gate\n");
console.log(pad("CASE", 28) + pad("SPEC", 7) + pad("ENGINE", 8) + pad("GATE", 7) + pad("EXPECT", 8) + "VERDICT");
for (const c of CASES) {
  const spec = specIntersect(CANDIDATE, c.other);
  const engine = boxesIntersect(CANDIDATE, c.other);
  const gate = validateUploadedSpace({
    spaceId: 1, tileId: 0, blocks: candidateBlocks, kind: "public", existingSpaces: [c.other],
  });
  const gateRejects = gate.errors.some((e) => /intersect/i.test(e));
  const ok = mark(c.name, "OVERLAP", spec === c.expect && engine === c.expect && gateRejects === c.expect,
    `spec=${spec} engine=${engine} gate=${gateRejects} expect=${c.expect} (${c.why})`);
  console.log(pad(c.name, 28) + pad(spec, 7) + pad(engine, 8) + pad(gateRejects, 7) + pad(c.expect, 8) +
    (ok ? "AGREE" : "DRIFT"));
}
// an empty existing-space list (the caller filters to the same zone) never
// raises the error — zones cannot intersect.
{
  const g = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: candidateBlocks, kind: "public", existingSpaces: [] });
  mark("different zone", "OVERLAP", !g.errors.some((e) => /intersect/i.test(e)),
    "an empty same-zone list must never raise SPACE_INTERSECTION");
}

// ── REDUCER source pin — the last line of defense (cannot be linked from node)
{
  const lib = readFileSync(join(root, "spacetime/src/lib.rs"), "utf8");
  const fn = lib.match(/fn boxes_intersect\([\s\S]*?\n}/)?.[0] ?? "";
  const sameFormula =
    /a_min_x <= b_max_x && b_min_x <= a_max_x/.test(fn) &&
    /a_min_y <= b_max_y && b_min_y <= a_max_y/.test(fn) &&
    /a_min_z <= b_max_z && b_min_z <= a_max_z/.test(fn);
  mark("spacetime/src/lib.rs", "RUST-FORMULA", sameFormula,
    "boxes_intersect must be the FORMULAS.md three-axis rule verbatim");

  const upsert = lib.match(/pub fn upsert_space\([\s\S]*?\n}/)?.[0] ?? "";
  const wired = /boxes_intersect\(/.test(upsert) && /intersects existing space/.test(upsert)
    && /zone_x != zone_x|s\.zone_x != zone_x/.test(upsert);
  mark("spacetime/src/lib.rs", "RUST-WIRED", wired,
    "upsert_space must run the same-zone guard before writing the box row");

  const commit = lib.match(/pub fn commit_zone_draft\([\s\S]*?\n}/)?.[0] ?? "";
  mark("spacetime/src/lib.rs", "RUST-PUBLISH-PATH", /upsert_space\(/.test(commit),
    "commit_zone_draft (the Zone-publish path) must route through the guarded upsert_space");
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log("");
if (drift) {
  for (const f of failures) console.log(`  DRIFT  ${f}`);
  console.log(`\nBOX-vs-SHAPE: ${checks - drift}/${checks} AGREE  ·  ${drift} DRIFT\n`);
  process.exit(1);
}
console.log(`BOX-vs-SHAPE: ${checks}/${checks} AGREE  ·  0 DRIFT`);
console.log("the box over-covers every non-rectangular Space, cannot distinguish a Space from its hull,");
console.log("and the same-zone overlap guard holds in FORMULAS.md, the engine, the publish gate, and the reducer\n");
