// Craft the INTERFACES-authored equivalent of the plaza-lobby door scene.
//
// ci/make-door-scenes.mjs authors plaza-lobby via the legacy `openings` array
// (ranged records the Rust wall-stamper consumes). Both shipped STDB fixtures
// publish openings-only; the interfaces -> openings -> links path is only
// unit-round-tripped, never exercised as a published scene. This builder
// authors the SAME three doors as a hand-written `interfaces` array (one
// per-cell Door / DoorLink element, DoorLinks carrying targetSpaceId) and
// derives the published `openings` via interfacesToOpenings — the actual
// interfaces-authored publish path (sceneOpenings prefers scene.interfaces).
//
// It exports the geometry so ci/engine-checks.mjs can assert the
// interfaces-authored scene derives the SAME openings + space_link set as the
// openings-authored plaza-lobby. Running it writes an save_scene call body to
// argv[2] (default /tmp) for the blocked live-STDB matrix (ER-10).
import { writeFileSync } from "fs";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { interfacesToOpenings } from "../space-shape";

const GRID = 64;

/** The plaza-lobby footprint + the three doors, expressed ONCE. Mirrors the
 *  lobby box + openings in ci/make-door-scenes.mjs so the two authorings are a
 *  true apples-to-apples pair (same box, same three doors). */
export const LOBBY_BOX = { minX: 16, minY: 16, maxX: 48, maxY: 48 };

/** The openings-authored plaza-lobby doors (identical to make-door-scenes). */
export const LOBBY_OPENINGS = [
  { side: "zMin", at: 16, from: 30, to: 32, fromY: 0, height: 2 },                                // door:0 zone exit
  { side: "zMax", at: 48, from: 30, to: 31, fromY: 0, height: 2, targetSpaceId: "plaza-flex" },   // door:1
  { side: "xMin", at: 16, from: 31, to: 32, fromY: 0, height: 2, targetSpaceId: "plaza-suites" }, // door:2
];

/**
 * The SAME three doors, hand-authored as per-cell engine interfaces (NOT via
 * openingsToInterfaces — this is authored, so the path is genuinely exercised):
 *   - zMin at 16, cells x 30..32  -> Door (no target, exits to the zone view)
 *   - zMax at 48, cells x 30..31  -> DoorLink -> plaza-flex
 *   - xMin at 16, cells z 31..32  -> DoorLink -> plaza-suites
 * network-lab axes: a zMin/zMax wall runs along x (varying x at fixed z=at); an
 * xMin/xMax wall runs along z (varying z at fixed x=at). The threshold block is
 * the floor voxel under the cut (y=0). span = [fromY, height].
 */
export const LOBBY_INTERFACES = [
  // door:0 — zone-exit Door on the zMin wall (z = 16), spanning x 30..32
  { x: 30, y: 0, z: 16, dir: "S", type: "Door", params: { span: [0, 2] } },
  { x: 31, y: 0, z: 16, dir: "S", type: "Door", params: { span: [0, 2] } },
  { x: 32, y: 0, z: 16, dir: "S", type: "Door", params: { span: [0, 2] } },
  // door:1 — DoorLink to plaza-flex on the zMax wall (z = 48), spanning x 30..31
  { x: 30, y: 0, z: 48, dir: "N", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "plaza-flex" } },
  { x: 31, y: 0, z: 48, dir: "N", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "plaza-flex" } },
  // door:2 — DoorLink to plaza-suites on the xMin wall (x = 16), spanning z 31..32
  { x: 16, y: 0, z: 31, dir: "W", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "plaza-suites" } },
  { x: 16, y: 0, z: 32, dir: "W", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "plaza-suites" } },
];

/** Openings derived from the hand-authored interfaces (the publish projection
 *  sceneOpenings/interfacesToOpenings produce when a scene ships interfaces). */
export const LOBBY_INTERFACES_OPENINGS = interfacesToOpenings(LOBBY_INTERFACES);

/** A floor-only voxel RLE for a box (same solid floor as make-door-scenes). */
export function makeFloorVoxels(box) {
  const faces = new Int32Array(GRID * GRID * GRID * 6);
  const solid = (x, y, z) => { const off = (z * GRID * GRID + y * GRID + x) * 6; for (let f = 0; f < 6; f++) faces[off + f] = 2; };
  for (let x = box.minX; x <= box.maxX; x++) for (let z = box.minY; z <= box.maxY; z++) solid(x, 0, z);
  const rle = [];
  let cur = faces[0], count = 1;
  for (let i = 1; i < faces.length; i++) {
    if (faces[i] === cur) count++;
    else { rle.push(cur, count); cur = faces[i]; count = 1; }
  }
  rle.push(cur, count);
  return rle;
}

/** The interfaces-authored plaza-lobby scene (interfaces present; openings the
 *  derived projection — exactly what a client that authors interfaces ships). */
export function makeInterfacesLobbyScene() {
  return {
    assets: [], objects: [], walls: [],
    voxels: { voxels: makeFloorVoxels(LOBBY_BOX) },
    interfaces: LOBBY_INTERFACES,
    openings: LOBBY_INTERFACES_OPENINGS,
  };
}

// When run directly, write the save_scene call body (for the ER-10
// live-STDB matrix). Importing this module (engine-checks) does not write.
// argv[1] may be relative (CI invokes `tsx ci/make-interfaces-scene.mjs`) —
// resolve it before comparing, or the guard silently skips the write.
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const out = process.argv[2] ?? "/tmp";
  const scene = makeInterfacesLobbyScene();
  writeFileSync(`${out}/interfaces-lobby.json`, JSON.stringify(["plaza-lobby", JSON.stringify(scene)]));
  console.log("interfaces scene written");
}
