// The ONE fixture scene builder for the ci/ generators.
//
// Extracted from make-door-scenes.mjs when make-hall-scenes.mjs needed the same
// construction; a second copy is how the single-layer defect would have been
// fixed in one place and not the other.
//
// Everything here obeys the publish law that `validate_space_geometry` enforces
// on the AUTHORED local solids, before the shell is synthesized:
//   height = max_y - min_y + 1 must be >= MIN_SPACE_HEIGHT (2) and one of
//   ALLOWED_HEIGHTS {2,4,6,8}; the lowest layer's distinct (x,z) is the floor
//   area and must be >= MIN_FLOOR_AREA (16).
//
// The height comes from an authored STAIR rather than a second solid layer, and
// that is measured, not stylistic: a slab at y=1 raises the walkable surface to
// 2 while a client enters at `box.min_z + 1`, and `ready` resolves the spawn
// with `drop_landing`, which searches at or BELOW the requested height and
// never upward — the whole room becomes unenterable with "No standable spawn at
// or below the requested height".

export const GRID = 64;

/**
 * A scene: solid floor over `box`, plus a 3-step stair to y=3 (height 4, an
 * allowed tier) anchored 4 cells in from the min corner, clear of the wall
 * lines every door sits on.
 *
 * `openings` are wall openings in engine form. One WITHOUT `targetSpaceId`
 * resolves by its LANDING (CD-05) — `derive_space_links` gives it
 * `to_world = space:<the Space containing the doormat, else the zone's
 * exterior remainder>` and a landing one cell outward.
 */
export function makeScene(box, openings) {
  const faces = new Int32Array(GRID * GRID * GRID * 6);
  const solid = (x, y, z) => {
    const off = (z * GRID * GRID + y * GRID + x) * 6;
    for (let f = 0; f < 6; f++) faces[off + f] = 2;
  };

  for (let x = box.minX; x <= box.maxX; x++)
    for (let z = box.minY; z <= box.maxY; z++) solid(x, 0, z);

  const sx = box.minX + 4, sz = box.minY + 4;
  solid(sx, 1, sz);
  solid(sx + 1, 1, sz); solid(sx + 1, 2, sz);
  solid(sx + 2, 1, sz); solid(sx + 2, 2, sz); solid(sx + 2, 3, sz);

  const rle = [];
  let cur = faces[0], count = 1;
  for (let i = 1; i < faces.length; i++) {
    if (faces[i] === cur) count++;
    else { rle.push(cur, count); cur = faces[i]; count = 1; }
  }
  rle.push(cur, count);

  return { assets: [], objects: [], walls: [], voxels: { voxels: rle }, openings };
}

/** A `save_scene` call body: [space_id, sceneJson]. */
export const callBody = (spaceId, scene) => JSON.stringify([spaceId, JSON.stringify(scene)]);
