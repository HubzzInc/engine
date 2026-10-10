// Two standable floors in one connected Space, used by the live reducer
// air-spawn matrix. At column (24,24): y=0 supports surface 1 and y=3
// supports surface 4, with two cells of headroom above each. A staircase away
// from the probe column connects the upper platform to the base component.
import { writeFileSync } from "fs";

const GRID = 64;
const faces = new Int32Array(GRID * GRID * GRID * 6);
const solid = (x, y, z) => {
  const off = (z * GRID * GRID + y * GRID + x) * 6;
  for (let f = 0; f < 6; f++) faces[off + f] = 2;
};

for (let x = 20; x <= 27; x++) for (let z = 20; z <= 27; z++) solid(x, 0, z);
solid(20, 1, 20); solid(21, 1, 20);
solid(21, 2, 20); solid(22, 2, 20);
for (let x = 22; x <= 24; x++) for (let z = 20; z <= 24; z++) solid(x, 3, z);

const rle = [];
let cur = faces[0], count = 1;
for (let i = 1; i < faces.length; i++) {
  if (faces[i] === cur) count++;
  else { rle.push(cur, count); cur = faces[i]; count = 1; }
}
rle.push(cur, count);

const scene = {
  assets: [], objects: [], walls: [], interfaces: [],
  voxels: { voxels: rle },
};
writeFileSync(process.argv[2] ?? "/tmp/air-spawn-scene.json", JSON.stringify(["plaza-lobby", JSON.stringify(scene)]));
console.log(`air-spawn scene written (${rle.length / 2} rle pairs)`);
