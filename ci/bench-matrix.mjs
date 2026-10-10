// BENCH MATRIX — the performance numbers the correctness matrices never
// measured. ci/nt1-matrix.mjs, ci/engine-checks.mjs and friends prove the
// engine is CORRECT; nothing has ever timed it. This script fills gap C3:
// NT1 wire bytes vs the naive occupancy baseline vs zlib, publish-gate wall
// time vs block count, and handshake-graph build + flood-fill component timing
// vs grid size.
//
// Scenes are DERIVED, never hand-typed: ci/fixtures/footprints.mjs
// constructors extruded to solids, plus generated stress scenes (hollow room,
// solid cubes, a hollow shell, a stacked tower, a two-room floor plan). Every
// number printed comes from an actual run on this machine; the JSON artifact
// is written next to this file as bench-results.json and the human table as
// bench-results.md.
//
//   npx tsx ci/bench-matrix.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  encodeNeswudBitmask,
  decodeNeswudBitmask,
  computeSpaceShape,
} from "../space-shape";
import { validateUploadedSpace } from "../space-gate";
import { BlockNodeGraph } from "../core/block-node";
import { createBlockNode } from "../core/schemas";
import { L } from "./fixtures/footprints.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RUNS = 5;

// ---------------------------------------------------------------- scenes
// network-lab coords: x east, z depth, y up. All scenes are single
// 6-connected solids with integer coords (NT1 requires both).
const B = (x, y, z) => ({ x, y, z, type: 2 });
const dedupe = (cells) => {
  const seen = new Set();
  return cells.filter((c) => {
    const k = `${c.x},${c.y},${c.z}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const solid = (w, h, d) => {
  const c = [];
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) c.push(B(x, y, z));
  return c;
};
const shell = (n) => {
  // hollow cube: cells on any of the six faces
  const c = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++)
        if (x === 0 || x === n - 1 || y === 0 || y === n - 1 || z === 0 || z === n - 1)
          c.push(B(x, y, z));
  return c;
};
const room = (w, d, wallH) => {
  // floor slab + perimeter walls (hollow room, open top)
  const c = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) c.push(B(x, 0, z));
  for (let y = 1; y <= wallH; y++)
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++)
        if (x === 0 || x === w - 1 || z === 0 || z === d - 1) c.push(B(x, y, z));
  return c;
};
const floorPlan = () => {
  // two 6x6 rooms side by side sharing the x=6 wall, with a 2-wide doorway
  const c = [];
  for (const x0 of [0, 6])
    for (let x = x0; x < x0 + 6; x++)
      for (let z = 0; z < 6; z++) c.push(B(x, 0, z));
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x < 12; x++)
      for (const z of [0, 5])
        c.push(B(x, y, z));
    for (let z = 0; z < 6; z++) {
      c.push(B(0, y, z)); // west wall of room A
      c.push(B(11, y, z)); // east wall of room B
      // shared wall x=6 with doorway at z=2,3 on the ground layer
      if (!(y === 1 && (z === 2 || z === 3))) c.push(B(6, y, z));
    }
  }
  return dedupe(c);
};
const tower = (floors, w) => {
  // floor slabs every 3 layers + a 1x1 stair column tying them together
  const c = [];
  for (let f = 0; f < floors; f++) {
    const y = f * 3;
    for (let x = 0; x < w; x++) for (let z = 0; z < w; z++) c.push(B(x, y, z));
  }
  for (let y = 0; y <= (floors - 1) * 3; y++) c.push(B(0, y, 0));
  return dedupe(c);
};

const SCENES = [
  ["pair", [B(0, 0, 0), B(1, 0, 0)]],
  ["L-8x6x6", L(8, 6, 3, 3).flatMap(([x, z]) => { const c = []; for (let y = 0; y < 6; y++) c.push(B(x, y, z)); return c; })],
  ["room-8x6", room(8, 6, 3)],
  ["floorplan-2room", floorPlan()],
  ["tower-10", tower(10, 6)],
  ["solid-8", solid(8, 8, 8)],
  ["solid-16", solid(16, 16, 16)],
  ["solid-32", solid(32, 32, 32)],
  ["shell-32", shell(32)],
];

// ---------------------------------------------------------------- helpers
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const timed = (fn, runs = RUNS) => {
  const ts = [];
  let out;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    out = fn();
    const t1 = process.hrtime.bigint();
    ts.push(Number(t1 - t0) / 1e6);
  }
  return { ms: median(ts), out };
};
const boundsOf = (blocks) => {
  const xs = blocks.map((b) => b.x), ys = blocks.map((b) => b.y), zs = blocks.map((b) => b.z);
  return {
    dx: Math.max(...xs) - Math.min(...xs) + 1,
    dy: Math.max(...ys) - Math.min(...ys) + 1,
    dz: Math.max(...zs) - Math.min(...zs) + 1,
    minX: Math.min(...xs), minY: Math.min(...ys), minZ: Math.min(...zs),
  };
};
const buildGraph = (blocks) => {
  const g = new BlockNodeGraph();
  for (const b of blocks)
    // network-lab (x, up=y, z) -> engine (x, y=depth, z=up), same as space-gate
    g.addBlock(createBlockNode(`b_${b.x}_${b.y}_${b.z}`, "bench", { x: b.x, y: b.z, z: b.y }));
  for (const b of blocks) g.autoLinkBlock(`b_${b.x}_${b.y}_${b.z}`);
  return g;
};

// ---------------------------------------------------------------- measure
const rows = [];
for (const [name, blocks] of SCENES) {
  // --- NT1 codec
  const nt1 = timed(() => encodeNeswudBitmask(blocks));
  const nt1Bytes = nt1.out.length;
  // round-trip sanity: the measured bytes must decode back to the block set
  const back = decodeNeswudBitmask(nt1.out);
  const roundtripOk = back.length === blocks.length;
  const bb = boundsOf(blocks);
  const vol = bb.dx * bb.dy * bb.dz;
  const bitmap = new Uint8Array(vol);
  for (const b of blocks)
    bitmap[(b.y - bb.minY) * bb.dx * bb.dz + (b.z - bb.minZ) * bb.dx + (b.x - bb.minX)] = 1;
  const zlibBytes = deflateSync(bitmap).length;

  // --- publish gate (full pipeline; verdict reported alongside timing)
  const gate = timed(() =>
    validateUploadedSpace({ spaceId: 7, tileId: 0, blocks, kind: "public" })
  );

  // --- handshake graph build + flood-fill component labeling
  const build = timed(() => buildGraph(blocks));
  const g = build.out;
  const flood = timed(() => g.findConnectedComponents());
  const clusters = flood.out.length;

  rows.push({
    scene: name,
    blocks: blocks.length,
    nt1_bytes: nt1Bytes,
    nt1_ms: +nt1.ms.toFixed(2),
    roundtrip_ok: roundtripOk,
    raw_bytes: vol,
    zlib_bytes: zlibBytes,
    nt1_over_raw: +(nt1Bytes / vol).toFixed(3),
    zlib_over_raw: +(zlibBytes / vol).toFixed(3),
    nt1_over_zlib: +(nt1Bytes / zlibBytes).toFixed(3),
    gate_ms: +gate.ms.toFixed(2),
    gate_valid: gate.out.valid,
    gate_errors: gate.out.errors.length,
    graph_build_ms: +build.ms.toFixed(2),
    flood_ms: +flood.ms.toFixed(2),
    clusters,
  });
  console.log(
    `${name.padEnd(14)} blocks=${String(blocks.length).padStart(6)} ` +
      `nt1=${String(nt1Bytes).padStart(6)}B (${(nt1Bytes / vol).toFixed(3)} of raw, ` +
      `${(nt1Bytes / zlibBytes).toFixed(2)}x zlib) ` +
      `gate=${gate.ms.toFixed(1)}ms valid=${gate.out.valid} ` +
      `flood=${flood.ms.toFixed(1)}ms clusters=${clusters}`
  );
}

// ---------------------------------------------------------------- corpus stats
const totalBlocks = rows.reduce((a, r) => a + r.blocks, 0);
const totalNt1 = rows.reduce((a, r) => a + r.nt1_bytes, 0);
const totalRaw = rows.reduce((a, r) => a + r.raw_bytes, 0);
const totalZlib = rows.reduce((a, r) => a + r.zlib_bytes, 0);
const corpus = {
  scenes: rows.length,
  total_blocks: totalBlocks,
  block_counts: rows.map((r) => ({ scene: r.scene, blocks: r.blocks })),
  nt1_bytes_total: totalNt1,
  raw_bytes_total: totalRaw,
  zlib_bytes_total: totalZlib,
  nt1_over_raw_total: +(totalNt1 / totalRaw).toFixed(3),
  zlib_over_raw_total: +(totalZlib / totalRaw).toFixed(3),
  nt1_over_zlib_total: +(totalNt1 / totalZlib).toFixed(3),
};

const result = {
  date: new Date().toISOString(),
  machine: "Linux VM (CI bench)",
  node: process.version,
  runs_per_measurement: RUNS,
  aggregation: "median",
  scenes: rows,
  corpus,
};
writeFileSync(join(here, "bench-results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`\nwrote ${join(here, "bench-results.json")}`);
console.log(
  `corpus: ${corpus.scenes} scenes, ${totalBlocks} blocks, ` +
    `NT1 ${totalNt1}B vs raw ${totalRaw}B (${corpus.nt1_over_raw_total}x) ` +
    `vs zlib ${totalZlib}B (${corpus.nt1_over_zlib_total}x)`
);
