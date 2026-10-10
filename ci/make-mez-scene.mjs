// Craft the B2 elevated-door live scene for plaza-mez (box 16..23 x 16..23,
// layers 0..3): floor across the 8x8 footprint, a supported mezzanine landing
// (2x2 columns rising to y=2 at x 19..20, z 17..18), and an ELEVATED door
// (fromY 2 — the top shell band, above a solid underwall) on zMin at x 19..20.
// The door is at the mezzanine level: riders step through at y=3.
//   node ci/make-mez-scene.mjs /tmp/mez-body.json
import { writeFileSync } from "fs";

const GRID = 64;
const faces = new Int32Array(GRID * GRID * GRID * 6);
const solid = (x, y, z) => { const off = (z * GRID * GRID + y * GRID + x) * 6; for (let f = 0; f < 6; f++) faces[off + f] = 2; };

for (let x = 16; x <= 23; x++) for (let z = 16; z <= 23; z++) solid(x, 0, z); // floor
for (const x of [19, 20]) for (const z of [17, 18]) for (let y = 1; y <= 2; y++) solid(x, y, z); // mezzanine columns

const rle = [];
let cur = faces[0], count = 1;
for (let i = 1; i < faces.length; i++) {
  if (faces[i] === cur) count++;
  else { rle.push(cur, count); cur = faces[i]; count = 1; }
}
rle.push(cur, count);

const scene = {
  assets: [], objects: [], walls: [],
  voxels: { voxels: rle },
  openings: [{ side: "zMin", at: 16, from: 19, to: 20, fromY: 2, height: 1 }], // the elevated door band
};

writeFileSync(process.argv[2] ?? "/tmp/mez-body.json", JSON.stringify(["plaza-mez", JSON.stringify(scene)]));
console.log(`scene written (${rle.length / 2} rle pairs)`);
