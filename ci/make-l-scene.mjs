// The L-shape truth fixture (CC-03): a 12x8 rectangle minus a 6x4 bite taken
// out of the max-x/max-z corner, floor at y=0, one door opening on each leg.
// This is the smallest footprint where "walls from the box" and "walls from
// the handshake graph" (engine/space-shape.ts synthesizeShellWalls over
// perimeterCells) disagree — the box hull runs across the bite; the law
// follows the notch.
//
// Reusable two ways:
//   - imported by ci/engine-checks.mjs for the box-vs-shape pins, and
//   - run as a script (pattern: ci/make-door-scenes.mjs) to write a
//     save_scene call body for the STDB matrix (CC-05: CLI law == reducer
//     law on a NON-rectangular space).
import { writeFileSync } from "fs";

const GRID = 64;

/** Footprint: rect L_RECT minus L_BITE removed from the max-x/max-z corner. */
export const L_ORIGIN = { x: 16, z: 16 };
export const L_RECT = { w: 12, d: 8 };
export const L_BITE = { w: 6, d: 4 };

/** One door per leg (absolute zone coords, matching L_ORIGIN):
 *  door:0 on the south edge of the horizontal leg, door:1 on the west edge of
 *  the vertical leg. Targetless = zone exits (fine for the fixture). */
export const L_OPENINGS = [
  { side: "zMin", at: 16, from: 18, to: 19, fromY: 0, height: 2 }, // horizontal leg
  { side: "xMin", at: 16, from: 20, to: 21, fromY: 0, height: 2 }, // vertical leg
];

/** The L floor cells: {x 16..27, z 16..19} ∪ {x 16..21, z 20..23}. 72 cells. */
export function lFloorCells(origin = L_ORIGIN) {
  const cells = [];
  for (let dx = 0; dx < L_RECT.w; dx++) {
    for (let dz = 0; dz < L_RECT.d; dz++) {
      const inBite = dx >= L_RECT.w - L_BITE.w && dz >= L_RECT.d - L_BITE.d;
      if (!inBite) cells.push({ x: origin.x + dx, z: origin.z + dz });
    }
  }
  return cells;
}

/** save_scene scene body for the L fixture (floor voxels + the two doors). */
export function makeLScene() {
  const faces = new Int32Array(GRID * GRID * GRID * 6);
  for (const { x, z } of lFloorCells()) {
    const off = (z * GRID * GRID + 0 * GRID + x) * 6;
    for (let f = 0; f < 6; f++) faces[off + f] = 2;
  }
  const rle = [];
  let cur = faces[0], count = 1;
  for (let i = 1; i < faces.length; i++) {
    if (faces[i] === cur) count++;
    else { rle.push(cur, count); cur = faces[i]; count = 1; }
  }
  rle.push(cur, count);
  return { assets: [], objects: [], walls: [], voxels: { voxels: rle }, openings: L_OPENINGS };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const out = process.argv[2] ?? "/tmp";
  writeFileSync(`${out}/l-truth.json`, JSON.stringify(["plaza-l-truth", JSON.stringify(makeLScene())]));
  console.log("L-shape truth scene written");
}
