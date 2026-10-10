// Craft the CI test scene for plaza-lobby (box 16..48, layers 0..3):
// floor across the footprint, a 3-step stair run at z=20 (x 20..22 →
// surfaces 2,3,4), and a door opening on zMin (x 30..32) — exercises the
// lintel rule. Writes the save_scene call body to the path in argv[2].
//   node ci/make-test-scene.mjs /tmp/upsert-body.json
import { writeFileSync } from "fs";

const GRID = 64;
const faces = new Int32Array(GRID * GRID * GRID * 6); // 0 = air
const solid = (x, y, z) => { const off = (z * GRID * GRID + y * GRID + x) * 6; for (let f = 0; f < 6; f++) faces[off + f] = 2; };

for (let x = 16; x <= 48; x++) for (let z = 16; z <= 48; z++) solid(x, 0, z); // floor
solid(20, 1, 20); solid(21, 1, 20); solid(21, 2, 20); solid(22, 1, 20); solid(22, 2, 20); solid(22, 3, 20); // stairs

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
  openings: [{ side: "zMin", at: 16, from: 30, to: 32, fromY: 0, height: 2 }],
};

writeFileSync(process.argv[2] ?? "/tmp/upsert-body.json", JSON.stringify(["plaza-lobby", JSON.stringify(scene)]));
console.log(`scene written (${rle.length / 2} rle pairs)`);
