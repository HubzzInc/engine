// Engine checks (pure — no network): 2D-Net fingerprint invariance + the
// simulate edge-case matrix, asserting the NESWUD laws hold.
//   npx tsx ci/engine-checks.mjs
import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  netFingerprint, computeSpaceShape, walkableHeights, findPath,
  openingsToInterfaces, interfacesToOpenings, synthesizeShellWalls,
  typedBoundaryFaces,
  resolveSpawn, suggestStep, canStep, shiftVoxelRle,
  handshakeStream, handshakeFingerprint,
  encodeNeswudBitmask, decodeNeswudBitmask,
  spaceSurfaceFingerprint, typedSurfaceStream,
} from "../space-shape";
import { sceneOpenings } from "../scene-codec";
import { boundingBoxFromBlocks, boxSize, shellViewBox } from "../shell-view";
import { validateUploadedSpace } from "../space-gate";
import { BlockNodeGraph } from "../core/block-node";
import { createBlockNode, createSpace } from "../core/schemas";
import { MovementSystem } from "../core/movement-system";
import { buildDefaultPublicSpace } from "../core/space-builder";
import {
  SpaceType, ZONE_GRID_SIZE, ZONE_ROAD_WIDTH, ZONE_SIDEWALK_WIDTH,
  ZONE_EDGE_RESERVE, ZONE_BUILDABLE_MIN, ZONE_BUILDABLE_MAX,
  zoneEdgeReserveViolations,
} from "../core/constants";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const results = [];
const log = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}`); };
const collectSourceFiles = (directories, sourceExtension, skip = /$a/) => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      // Directories outside `root` (the skin at ../src, the viz at ../viz) do
      // not share its prefix, so slicing would mangle them — and a mangled
      // string silently defeats the skip patterns. Fall back to the absolute
      // path, which the anchored patterns match correctly either way.
      const relative = path.startsWith(root + "/") ? path.slice(root.length + 1) : path;
      if (skip.test(relative)) continue;
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (sourceExtension.test(name)) files.push(path);
    }
  };
  for (const directory of directories) walk(join(root, directory));
  return files;
};
const lineHits = (files, forbidden, exempt = /$a/) => {
  const hits = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let index = 0; index < lines.length; index++) {
      if (forbidden.test(lines[index]) && !exempt.test(lines[index])) {
        hits.push(`${file.slice(root.length + 1)}:${index + 1}`);
      }
    }
  }
  return hits;
};

// --- fingerprint invariance: rotation+translation identical, mirror distinct
const L = [];
for (let x = 0; x < 4; x++) for (let z = 0; z < 6; z++) if (!(x >= 2 && z >= 3)) L.push({ x, y: 0, z });
const rot = L.map(({ x, z }) => ({ x: z + 10, y: 0, z: 3 - x + 20 }));
const mir = L.map(({ x, z }) => ({ x: -x + 50, y: 0, z }));
log("fingerprint: rotation+translation invariant", netFingerprint(L).id === netFingerprint(rot).id);
log("fingerprint: mirror distinct", netFingerprint(L).id !== netFingerprint(mir).id);

// --- shape graph: courtyard footprint has outer + inner perimeters
const donut = [];
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) if (!(x >= 3 && x < 5 && z >= 3 && z < 5)) donut.push({ x, y: 0, z });
const shape = computeSpaceShape(donut);
const horiz = shape.boundaryFaces.filter((f) => f.dir !== "U" && f.dir !== "D").length;
log("courtyard: one cluster, inner+outer boundary faces", shape.clusters.length === 1 && horiz === 32 + 8, `clusters=${shape.clusters.length} horizontalFaces=${horiz}`);

// --- walkability law: lintel passable, wall blocked, stair path exists
const blocks = [];
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) blocks.push({ x, y: 0, z });   // floor
for (let x = 0; x < 8; x++) for (let y = 1; y <= 3; y++) if (x !== 4 || y === 3) blocks.push({ x, y, z: 0 }); // wall with door @x4 (lintel at y3)
blocks.push({ x: 2, y: 1, z: 4 }); // one stair step
const heights = walkableHeights(blocks, 8);
log("walkability: door lintel keeps floor standable", heights[0 * 8 + 4] === 1, `surface=${heights[4]}`);
log("walkability: wall column stands only at top", heights[0 * 8 + 3] === 4, `surface=${heights[3]}`);
const path = findPath(heights, 8, { x: 0, z: 4 }, { x: 2, z: 4 });
log("walkability: A* climbs the stair step", !!path, path ? `${path.length} steps` : "no path");
const spawnHeights = new Array(9).fill(0);
spawnHeights[1] = 1;
const spawnPath = findPath(spawnHeights, 3, { x: 0, z: 0 }, { x: 1, z: 0 });
log("walkability: A* preserves the unknown-origin spawn step",
  spawnPath?.length === 2, spawnPath ? `${spawnPath.length} steps` : "no path");

// --- interface model: openings <-> InterfaceElements round-trip
const authored = [
  { side: "zMin", at: 16, from: 30, to: 32, fromY: 0, height: 2 },                                  // door
  { side: "xMin", at: 16, from: 5, to: 7, fromY: 1, height: 1 },                                    // window
  { side: "xMax", at: 48, from: 20, to: 21, fromY: 0, height: 2, targetSpaceId: "plaza-flex" },     // door-link
];
const lifted = openingsToInterfaces(authored);
const projected = interfacesToOpenings(lifted);
const norm = (os) => JSON.stringify([...os].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
log("interfaces: openings round-trip exact", norm(projected) === norm(authored), `${lifted.length} elements -> ${projected.length} openings`);
log("interfaces: door-link carries target", lifted.some((i) => i.type === "DoorLink" && i.params?.targetSpaceId === "plaza-flex"));

// --- typed boundary projection: the face address survives interface typing
const faceNet = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
];
const rawFaceNet = computeSpaceShape(faceNet).boundaryFaces;
const typedFaceNet = typedBoundaryFaces(faceNet, [
  { x: 0, y: 0, z: 0, dir: "W", type: "Door", params: { span: [0, 1] } },
  { x: 1, y: 0, z: 0, dir: "U", type: "Window" },
]);
log("interfaces: typing preserves every NESWUD boundary face",
  typedFaceNet.length === rawFaceNet.length,
  `raw=${rawFaceNet.length} typed=${typedFaceNet.length}`);
log("interfaces: door remains the exact W face, not a hole",
  typedFaceNet.some((f) => f.x === 0 && f.y === 0 && f.z === 0 && f.dir === "W" && f.type === "door"));
log("interfaces: U/D faces can carry typed skylight surfaces",
  typedFaceNet.some((f) => f.x === 1 && f.y === 0 && f.z === 0 && f.dir === "U" && f.type === "window"));

// --- the ONE span law (interfaceSpan): a spanless interface defaults to the
// CANONICAL fingerprint-stream span — [y, 2] for a Door — at EVERY consumer.
// authoredInterfaceAtFace used to default to ONE layer while typedSurfaceStream
// committed TWO (qa/INTERFACE-REMAINING.md "Open engine question", resolved
// 2026-08-05 by the audit-mandated unification); this pins the five former
// inline declaration sites to the helper's single default.
const spanlessWall = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
const spanlessDoor = [{ x: 0, y: 0, z: 0, dir: "W", type: "Door" }];
const spanlessDoorLayers = typedBoundaryFaces(spanlessWall, spanlessDoor)
  .filter((f) => f.dir === "W" && f.type === "door").map((f) => f.y).sort().join(",");
log("span law: spanless Door types BOTH wall layers", spanlessDoorLayers === "0,1", `door layers=[${spanlessDoorLayers}]`);
const spanlessStreamHeight = Number(typedSurfaceStream(spanlessDoor).split(",")[6]);
const spanlessOpenings = interfacesToOpenings(spanlessDoor);
log("span law: stream and openings agree on default height 2",
  spanlessStreamHeight === 2 &&
    spanlessOpenings.length === 1 && spanlessOpenings[0].fromY === 0 && spanlessOpenings[0].height === 2,
  `stream=${spanlessStreamHeight} opening=${spanlessOpenings[0]?.fromY},${spanlessOpenings[0]?.height}`);

// --- interfaces-authored publish path (ER-05): a scene may ship an authored
// `interfaces` array instead of legacy `openings` (sceneOpenings prefers
// scene.interfaces and derives openings via interfacesToOpenings). Both shipped
// STDB fixtures publish openings-only, so this path was never exercised as a
// published scene. Here we assert the HAND-AUTHORED interfaces plaza-lobby
// (ci/make-interfaces-scene.mjs) derives the SAME openings AND the SAME
// space_link set as the openings-authored plaza-lobby (ci/make-door-scenes.mjs).
// The LIVE reducer parity (publish + hubzz doors --verify + post-republish
// walkable) is the blocked ER-10 (stdb matrix, CI-only); this is the local half.
const { LOBBY_OPENINGS, LOBBY_INTERFACES, LOBBY_INTERFACES_OPENINGS } =
  await import("./make-interfaces-scene.mjs");
// The reducer's derive_space_links mirror now lives in the engine
// (space-links.ts) — imported here, not copied, so it cannot drift.
const { deriveLinks: engineDeriveLinks } = await import("../space-links.ts");
const linkNorm = (l) =>
  `${l.linkId}|${l.toWorld}|${l.x.toFixed(1)},${l.z.toFixed(1)}|${l.spawnX.toFixed(1)},${l.spawnZ.toFixed(1)}`;
const deriveLinks = (spaceId, zoneX, zoneY, openings) =>
  engineDeriveLinks({ spaceId, zoneX, zoneY }, openings, new Map()).map(linkNorm);
// (a) the interfaces-derived openings deep-equal the openings-authored lobby
const ifaceOpeningsMatch = norm(LOBBY_INTERFACES_OPENINGS) === norm(LOBBY_OPENINGS);
// (b) the space_link set derived from each is identical (link derivation equal).
// Derive from BOTH sides independently, then compare — proving the reducer would
// store the same door-transition rows whether the scene shipped openings or
// interfaces. Scene order matters (door:n index), so derive over each in order.
const openingsLinks = deriveLinks("plaza-lobby", 5, 5, LOBBY_OPENINGS);
const interfaceLinks = deriveLinks("plaza-lobby", 5, 5, LOBBY_INTERFACES_OPENINGS);
const linkSetsEqual = openingsLinks.length === interfaceLinks.length &&
  new Set(openingsLinks).size === new Set([...openingsLinks, ...interfaceLinks]).size;
log("interfaces: authored scene derives the SAME openings as openings-authored",
  ifaceOpeningsMatch, `${LOBBY_INTERFACES.length} interfaces -> ${LOBBY_INTERFACES_OPENINGS.length} openings == ${LOBBY_OPENINGS.length} authored`);
log("interfaces: authored scene derives the SAME space_link set",
  linkSetsEqual && openingsLinks.length === 4 && interfaceLinks.length === 4,
  `${interfaceLinks.length} links (1 exterior exit + its :entry: reverse + 2 DoorLinks) match`);

// --- engine rules: private entrance + door-link target
const roomBlocks = [];
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
  roomBlocks.push({ x, y: 0, z, type: 2 });
  if (x === 0 || z === 0 || x === 7 || z === 7) roomBlocks.push({ x, y: 1, z, type: 2 });
}
const noDoor = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: roomBlocks, kind: "private" });
log("engine: ENTRANCE_REQUIRED for doorless private", !noDoor.valid && noDoor.errors.some((e) => /entrance/i.test(e)));
const withDoor = validateUploadedSpace({
  spaceId: 1, tileId: 0, blocks: roomBlocks, kind: "private",
  interfaces: [{ x: 4, y: 0, z: 0, dir: "S", type: "Door", params: { span: [0, 2] } }],
});
log("engine: private with Door passes entrance rule", !withDoor.errors.some((e) => /entrance/i.test(e)));
const interiorFaceDoor = validateUploadedSpace({
  spaceId: 1, tileId: 0, blocks: roomBlocks, kind: "private",
  // The E handshake exists: (4,0,4) touches (5,0,4). A Door may TYPE a
  // missing boundary face; it may not masquerade as a volume between blocks.
  interfaces: [{ x: 4, y: 0, z: 4, dir: "E", type: "Door", params: { span: [0, 2] } }],
});
log("interfaces: an existing handshake cannot be authored as a Door surface",
  interiorFaceDoor.errors.some((e) => /entrance/i.test(e)),
  interiorFaceDoor.errors.join(" | "));
const badLink = validateUploadedSpace({
  spaceId: 1, tileId: 0, blocks: roomBlocks, kind: "public",
  interfaces: [{ x: 4, y: 0, z: 0, dir: "S", type: "DoorLink", params: { span: [0, 2] } }],
});
log("engine: DoorLink without target rejected", badLink.errors.some((e) => /DoorLink/i.test(e)));

// --- spine-as-entrance: a stacked private floor (spineReachable) needs no Door
const stackedPrivate = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: roomBlocks, kind: "private", spineReachable: true });
log("engine: spine-reached private floor waives the door requirement", !stackedPrivate.errors.some((e) => /entrance/i.test(e)));
const standalonePrivate = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: roomBlocks, kind: "private", spineReachable: false });
log("engine: standalone private still requires a door", standalonePrivate.errors.some((e) => /entrance/i.test(e)));

// --- space intersection: two spaces in the same zone may never overlap.
// The candidate (roomBlocks → engine box 0,0,0–7,7,1) is checked against the
// bounding boxes of already-published spaces in the zone. Overlap on ALL
// three axes = intersection = reject.
// (a) overlapping existing space (same footprint, z 0–3) → must be rejected
const overlapExisting = [{ min: { x: 0, y: 0, z: 0 }, max: { x: 7, y: 7, z: 3 } }];
const overlapCandidate = validateUploadedSpace({
  spaceId: 2, tileId: 0, blocks: roomBlocks, kind: "public",
  existingSpaces: overlapExisting,
});
log("engine: SPACE_INTERSECTION rejects overlapping candidate",
  !overlapCandidate.valid && overlapCandidate.errors.some((e) => /intersect/i.test(e)),
  overlapCandidate.errors.find((e) => /intersect/i.test(e)) ?? "");
// (b) non-overlapping (existing at z 4–7, stacked above) → must pass
const stackedExisting = [{ min: { x: 0, y: 0, z: 4 }, max: { x: 7, y: 7, z: 7 } }];
const stackedCandidate = validateUploadedSpace({
  spaceId: 2, tileId: 0, blocks: roomBlocks, kind: "public",
  existingSpaces: stackedExisting,
});
log("engine: SPACE_INTERSECTION allows non-overlapping stacked space",
  stackedCandidate.errors.every((e) => !/intersect/i.test(e)),
  `${stackedCandidate.errors.length} errors (none intersection)`);
// (c) different zone — the caller filters existing spaces to the same zone
// before passing them, so a candidate in a different zone gets an empty list
// and must pass (zones can't intersect).
const diffZoneCandidate = validateUploadedSpace({
  spaceId: 2, tileId: 1, blocks: roomBlocks, kind: "public",
  existingSpaces: [],
});
log("engine: SPACE_INTERSECTION ignores spaces in a different zone",
  diffZoneCandidate.errors.every((e) => !/intersect/i.test(e)));

// --- fingerprint changes when a cutout breaks the wall (the bit signature
// tracks doors/windows because the wall solids change)
const fp = [];
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) fp.push({ x, y: 0, z });
const sealed = fp.concat(synthesizeShellWalls(fp, 2));
const doored = fp.concat(synthesizeShellWalls(fp, 2, [{ side: "zMin", at: 0, from: 3, to: 4, fromY: 0, height: 2 }]));
log("fingerprint: door cutout changes the derived solid identity", netFingerprint(sealed).id !== netFingerprint(doored).id);

// --- the binary string (CANON-LEDGER §): position-ABSOLUTE handshake stream
// + sha256, distinct from the invariant net id. The oracle-pinned pair hash
// (meta 0_0-True-[]-) is the exact bytes the oracle's real
// Zone.generate_fingerprint_hash returns for these two blocks.
log("handshake: stream is the oracle's exact serialization",
  handshakeStream([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]) === "0_0_0_0_0:E|0_0_1_0_0:W|");
log("handshake: pair hash == the live oracle's bytes",
  handshakeFingerprint([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], "0_0-True-[]-") ===
    "e113d85106f59722d46d9ad9dea537168ae068f9f47626ba43307db961fe5d1e");
log("handshake: position-absolute (translation changes the hash)",
  handshakeFingerprint([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], "0_0-True-[]-") !==
    handshakeFingerprint([{ x: 5, y: 0, z: 3 }, { x: 6, y: 0, z: 3 }], "0_0-True-[]-"));
log("handshake: door cutout changes the fingerprint (walls change the stream)",
  handshakeFingerprint(sealed, "0_0-True-[]-") !== handshakeFingerprint(doored, "0_0-True-[]-"));

const surfaceDoor = [{ x: 3, y: 0, z: 0, dir: "S", type: "Door", params: { span: [0, 2] } }];
const surfaceWindow = [{ x: 3, y: 0, z: 0, dir: "S", type: "Window", params: { span: [0, 2] } }];
const surfaceLinkA = [{ x: 3, y: 0, z: 0, dir: "S", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "a" } }];
const surfaceLinkB = [{ x: 3, y: 0, z: 0, dir: "S", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "b" } }];
const surfaceMeta = "surface-True-[]-";
log("fingerprint: saved surface identity is explicitly versioned",
  spaceSurfaceFingerprint(fp, surfaceMeta, []) .startsWith("neswud2:"));
log("fingerprint: Door and Window types remain distinct",
  spaceSurfaceFingerprint(fp, surfaceMeta, surfaceDoor) !== spaceSurfaceFingerprint(fp, surfaceMeta, surfaceWindow));
log("fingerprint: DoorLink targets remain distinct",
  spaceSurfaceFingerprint(fp, surfaceMeta, surfaceLinkA) !== spaceSurfaceFingerprint(fp, surfaceMeta, surfaceLinkB));
log("fingerprint: typed-surface order is canonical",
  spaceSurfaceFingerprint(fp, surfaceMeta, surfaceDoor.concat(surfaceLinkA)) ===
    spaceSurfaceFingerprint(fp, surfaceMeta, surfaceLinkA.concat(surfaceDoor)));
log("fingerprint: TS surface bytes match the Rust pin",
  spaceSurfaceFingerprint([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], "space-True-[]-", [
    { x: 0, y: 0, z: 0, dir: "W", type: "Door", params: { span: [0, 2] } },
  ]) === "neswud2:27d8fab026cd13ddf80066432378e4b436543dc3da1305238c5b1a095635ba75");
const unicodeSurfaceStream = typedSurfaceStream([
  { x: 0, y: 0, z: 0, dir: "W", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "é" } },
  { x: 0, y: 0, z: 0, dir: "W", type: "DoorLink", params: { span: [0, 2], targetSpaceId: "z" } },
]);
log("fingerprint: surface ordering is UTF-8 bytewise like Rust",
  unicodeSurfaceStream.indexOf("1:z|") < unicodeSurfaceStream.indexOf("2:é|"));
let malformedSurfaceRejected = false;
try { typedSurfaceStream([{ x: 0.5, y: 0, z: 0, dir: "W", type: "Door" }]); }
catch { malformedSurfaceRejected = true; }
log("fingerprint: malformed fractional surface addresses are rejected", malformedSurfaceRejected);

const authoredOnly = sceneOpenings({ interfaces: surfaceLinkA });
log("interfaces: authored truth derives the wall-opening projection",
  authoredOnly.openings.length === 1 && authoredOnly.openings[0].targetSpaceId === "a");

// --- compact 9-bit 2D-Net synthesis: the original cell-token layout is the
// wire form; the current reciprocal graph is its decoded runtime view; the
// existing oracle-pinned handshake hash remains the integrity projection.
const maskPair = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];
const maskPairBytes = encodeNeswudBitmask(maskPair);
log("bitmask: two-cell net has the pinned 9-bit wire bytes",
  Buffer.from(maskPairBytes).toString("hex") === "4e54310000010001000100000000000200000052b102",
  Buffer.from(maskPairBytes).toString("hex"));
const maskPairRoundTrip = decodeNeswudBitmask(maskPairBytes);
log("bitmask: compact net reconstructs the exact blocks",
  JSON.stringify(maskPairRoundTrip) === JSON.stringify(maskPair));
log("bitmask: reconstructed graph produces the existing oracle fingerprint",
  handshakeFingerprint(maskPairRoundTrip, "0_0-True-[]-") ===
    "e113d85106f59722d46d9ad9dea537168ae068f9f47626ba43307db961fe5d1e");

const maskRoom = L.concat(synthesizeShellWalls(L, 2));
const maskRoomRoundTrip = decodeNeswudBitmask(encodeNeswudBitmask(maskRoom));
const blockOrder = (bs) => bs.map((b) => `${b.x},${b.y},${b.z}`).sort().join("|");
log("bitmask: non-uniform room round-trips without box expansion",
  blockOrder(maskRoomRoundTrip) === blockOrder(maskRoom),
  `${maskRoom.length} blocks -> ${encodeNeswudBitmask(maskRoom).length} bytes`);
const trainTower = [];
for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) trainTower.push({ x, y, z });
const trainTowerBytes = encodeNeswudBitmask(trainTower);
log("bitmask: train-up repetition stores a 32-layer tower as one footprint",
  blockOrder(decodeNeswudBitmask(trainTowerBytes)) === blockOrder(trainTower) && trainTowerBytes.length < 128,
  `${trainTower.length} blocks -> ${trainTowerBytes.length} bytes`);
const oversizedNet = new Uint8Array(19);
oversizedNet.set([0x4e, 0x54, 0x31]);
const oversizedView = new DataView(oversizedNet.buffer);
oversizedView.setUint16(5, 1, true); // one run
oversizedView.setUint16(7, 1, true); // repeat
oversizedView.setUint16(9, 1, true); // one component
oversizedView.setUint32(15, 1_000_001, true);
let oversizedNetRejected = false;
try { decodeNeswudBitmask(oversizedNet); } catch (error) { oversizedNetRejected = /decoded-cell limit/.test(String(error)); }
log("bitmask: hostile decoded-cell expansion is bounded before allocation", oversizedNetRejected);
const overflowYNet = encodeNeswudBitmask([{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]);
new DataView(overflowYNet.buffer).setInt16(3, 32767, true);
let overflowYRejected = false;
try { decodeNeswudBitmask(overflowYNet); } catch (error) { overflowYRejected = /y range/.test(String(error)); }
log("bitmask: decoded train cannot overflow signed 16-bit elevation", overflowYRejected);
const defaultPublicSpace = buildDefaultPublicSpace("zone:test", [
  createBlockNode("outside-a", "zone:test", { x: 0, y: 0, z: 0 }),
  createBlockNode("outside-b", "zone:test", { x: 1, y: 0, z: 0 }),
  createBlockNode("outside-c", "zone:test", { x: 8, y: 0, z: 0 }),
], []);
log("publish: all undefined allocation becomes one Public remainder space",
  defaultPublicSpace?.type === SpaceType.Public &&
  defaultPublicSpace.tags?.includes("exterior") === true &&
  defaultPublicSpace.blockIds.length === 3);
const assignedSpace = createSpace("authored", "zone:test", SpaceType.Private);
assignedSpace.blockIds = ["inside"];
const oddRemainder = buildDefaultPublicSpace("zone:test", [
  createBlockNode("inside", "zone:test", { x: 2, y: 0, z: 2 }),
  createBlockNode("outside-a", "zone:test", { x: 0, y: 0, z: 0 }),
  createBlockNode("outside-b", "zone:test", { x: 63, y: 0, z: 63 }),
  createBlockNode("outside-tall", "zone:test", { x: 9, y: 12, z: 9 }),
], [assignedSpace]);
log("publish: disconnected leftovers stay one Public exterior remainder",
  oddRemainder?.type === SpaceType.Public &&
  oddRemainder.tags?.includes("exterior") === true &&
  oddRemainder.blockIds.join(",") === "outside-a,outside-b,outside-tall");
log("publish: Public remainder keeps the broad envelope without room-height clamping",
  oddRemainder?.boundingBox.max.y === 12 && oddRemainder.boundingBox.max.x === 63 && oddRemainder.boundingBox.max.z === 63,
  JSON.stringify(oddRemainder?.boundingBox));
const fullAssigned = createSpace("full", "zone:test", SpaceType.Public);
fullAssigned.blockIds = ["a", "b"];
log("publish: fully assigned allocation has no default Public remainder",
  buildDefaultPublicSpace("zone:test", [
    createBlockNode("a", "zone:test", { x: 0, y: 0, z: 0 }),
    createBlockNode("b", "zone:test", { x: 1, y: 0, z: 0 }),
  ], [fullAssigned]) === null);
const bitmaskCli = JSON.parse(execFileSync(join(root, "cli", "hubzz"), [
  "bitmask", "--blocks", join(root, "ci", "fixtures", "neswud-pair.json"),
  "--meta", "0_0-True-[]-", "--json",
], { encoding: "utf8" }));
log("bitmask: CLI proves mask -> graph -> oracle fingerprint end to end",
  bitmaskCli.format === "NT1" && bitmaskCli.bytes === 22 && bitmaskCli.blocks === 2 && bitmaskCli.roundTrip === true &&
    bitmaskCli.fingerprint === "e113d85106f59722d46d9ad9dea537168ae068f9f47626ba43307db961fe5d1e");

// --- movement-system equivalence pins: every surface our law derives is
// engine-legal; void columns are engine-illegal. (Directional by design: the
// engine allows ANY standable block; the deployed law picks the LOWEST.)
const fix = [];
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) if (!(x === 7 && z === 7)) fix.push({ x, y: 0, z }); // floor, one void corner
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
  if (x === 7 && z === 7) continue;
  const edge = x === 0 || z === 0 || x === 7 || z === 7;
  if (!edge) continue;
  for (let y = 1; y <= 3; y++) {
    if (x === 4 && z === 0 && y <= 2) continue; // door gap (lintel at y3 stays)
    fix.push({ x, y, z });
  }
}
fix.push({ x: 2, y: 1, z: 4 }); // stair step
const fixHeights = walkableHeights(fix, 8);

const engineGraph = new BlockNodeGraph();
for (const b of fix) engineGraph.addBlock(createBlockNode(`f_${b.x}_${b.y}_${b.z}`, "fix", { x: b.x, y: b.z, z: b.y }));
for (const b of fix) engineGraph.autoLinkBlock(`f_${b.x}_${b.y}_${b.z}`);
const movement = new MovementSystem(engineGraph);
const character = { position: { x: 4, y: 4, z: 0 }, height: 1.5, standingOnBlockId: null, isValidPosition: true };

let surfacesChecked = 0, surfacesEngineLegal = 0;
for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
  const s = fixHeights[z * 8 + x];
  if (s === 0) continue;
  surfacesChecked++;
  const verdict = movement.validateMovement(character, { x: x + 0.5, y: z + 0.5, z: s - 1 + 0.25 });
  if (verdict.allowed) surfacesEngineLegal++;
}
log("movement: every derived surface is engine-legal", surfacesChecked > 0 && surfacesEngineLegal === surfacesChecked, `${surfacesEngineLegal}/${surfacesChecked}`);
const voidVerdict = movement.validateMovement(character, { x: 7.5, y: 7.5, z: 0.25 });
log("movement: void column is engine-illegal", fixHeights[7 * 8 + 7] === 0 && !voidVerdict.allowed, voidVerdict.deniedReason ?? "");

// --- movement biconditional: the shipped step law (space-shape canStep) and
// the engine MovementSystem must agree in BOTH directions, over every cell —
// so the deployed law and the engine class can never silently diverge.
// engineLegal(x,z): is the derived surface cell engine-legal per validateMovement?
// (mirrors the surface->position map used by the directional pins above.)
const engineLegal = (x, z) => {
  const s = fixHeights[z * 8 + x];
  const pos = s > 0 ? { x: x + 0.5, y: z + 0.5, z: s - 1 + 0.25 } : { x: x + 0.5, y: z + 0.5, z: 0.25 };
  return movement.validateMovement(character, pos).allowed;
};
// (a) standability biconditional over the whole grid: a cell steps-to-itself
// (canStep(c,c) == the standable half of the step law, delta 0) IFF the engine
// deems that cell legal. Covers BOTH allowed (standable) and denied (void) cells.
let standChecked = 0, standAgree = 0, standAllowed = 0, standDenied = 0;
for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
  standChecked++;
  const self = canStep(fixHeights, 8, x, z, x, z);
  const legal = engineLegal(x, z);
  if (self === legal) standAgree++;
  if (legal) standAllowed++; else standDenied++;
}
log("movement: canStep(c,c) <=> engine-legal over every cell",
  standChecked === 64 && standAgree === standChecked && standAllowed > 0 && standDenied > 0,
  `${standAgree}/${standChecked} agree (${standAllowed} allowed, ${standDenied} denied)`);
// (b) directional step-law <=> engine legality over real adjacent steps: when
// the target cell is engine-legal, canStep(from,to) == the height-delta rule;
// when the target is engine-illegal (void), canStep must deny. This binds the
// from->to step law to the engine's per-cell verdict in both directions.
const stepDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
let dirAllowed = 0, dirDenied = 0, dirAgree = 0, dirTotal = 0;
for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
  const from = fixHeights[z * 8 + x];
  if (from === 0) continue;
  for (const [dx, dz] of stepDirs) {
    const nx = x + dx, nz = z + dz;
    if (nx < 0 || nx >= 8 || nz < 0 || nz >= 8) continue;
    dirTotal++;
    const step = canStep(fixHeights, 8, x, z, nx, nz);
    if (engineLegal(nx, nz)) { dirAllowed++; if (step === (Math.abs(fixHeights[nz * 8 + nx] - from) <= 1)) dirAgree++; }
    else { dirDenied++; if (step === false) dirAgree++; }
  }
}
log("movement: canStep(from,to) <=> engine step verdict (allowed+denied)",
  dirTotal > 0 && dirAgree === dirTotal && dirAllowed > 0 && dirDenied > 0,
  `${dirAgree}/${dirTotal} agree (${dirAllowed} allowed-target, ${dirDenied} denied-target)`);

// suggestions are always reducer-legal steps
const illegalSteps = [
  [{ x: 2, z: 2 }, { x: 0, z: 2 }],  // into the wall
  [{ x: 5, z: 5 }, { x: 7, z: 7 }],  // into the void
];
let sugOk = true;
for (const [from, to] of illegalSteps) {
  const sug = suggestStep(fixHeights, 8, from, to);
  if (sug && !canStep(fixHeights, 8, from.x, from.z, sug.x, sug.z)) sugOk = false;
}
log("movement: every suggestion satisfies the step law", sugOk);

// --- suggestStep landing is reducer-legal: every corrected landing the engine
// hands back must be a STANDABLE cell in the space's derived walkable grid
// (heights[landing] > 0) — this is the engine-level mirror of the reducer's
// snap_landing legality (the "correctedPosition is reducer-legal" gap). canStep
// already excludes void targets, but that is TS-internal; here we bind the
// landing directly to the derived space_walkable grid over a corpus of from->to
// pairs spanning legal, wall-blocked, and void-target steps.
const suggestCorpus = [];
for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
  if (fixHeights[z * 8 + x] === 0) continue; // only originate from standable columns
  for (const [tx, tz] of [[0, 4], [7, 7], [4, 0], [3, 0], [2, 4], [5, 5], [x, z]]) {
    suggestCorpus.push([{ x, z }, { x: tx, z: tz }]);
  }
}
let landChecked = 0, landStandable = 0, landStepLegal = 0, landNull = 0;
for (const [from, to] of suggestCorpus) {
  const sug = suggestStep(fixHeights, 8, from, to);
  landChecked++;
  if (!sug) { landNull++; continue; }
  if (fixHeights[sug.z * 8 + sug.x] > 0 && sug.surface === fixHeights[sug.z * 8 + sug.x]) landStandable++;
  if (canStep(fixHeights, 8, from.x, from.z, sug.x, sug.z)) landStepLegal++;
}
const landReturned = landChecked - landNull;
log("movement: every suggestStep landing is a standable derived-grid cell",
  landReturned > 0 && landStandable === landReturned && landStepLegal === landReturned,
  `${landStandable}/${landReturned} landings standable+step-legal (${landNull} null over ${landChecked} pairs)`);

// spawn law: identity on a standable cell, relocation off the void
const identity = resolveSpawn(fixHeights, 8, 3, 3);
log("spawn: standable cell resolves to itself", identity?.x === 3 && identity?.z === 3);
const relocated = resolveSpawn(fixHeights, 8, 7, 7);
log("spawn: void request relocates to a standable column", !!relocated && fixHeights[relocated.z * 8 + relocated.x] > 0 && !(relocated.x === 7 && relocated.z === 7));
const lintel = fixHeights[0 * 8 + 4];
log("spawn: door-gap column keeps the floor surface (lintel)", lintel === 1, `surface=${lintel}`);

// --- rooms (engine hollow-space law) + exterior marking
const { computeRooms, exteriorCells } = await import("../space-rooms.ts");
const mass = [];
for (let x = 0; x < 6; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 6; z++) mass.push({ x, y, z });
const chamber = (b) => !(b.x >= 2 && b.x <= 3 && b.y >= 1 && b.y <= 2 && b.z >= 2 && b.z <= 3);
const sealedMass = mass.filter(chamber);
const sealedReport = computeRooms(sealedMass);
log("rooms: enclosed chamber detected as sealed", sealedReport.sealedRooms.length === 1 && sealedReport.sealedRooms[0].cells === 8, JSON.stringify(sealedReport.sealedRooms));
const tunnelled = sealedMass.filter((b) => !(b.x >= 4 && b.y === 1 && b.z === 2)); // carve to the face
const openReport = computeRooms(tunnelled);
log("rooms: tunnel to the outside unseals it", openReport.sealedRooms.length === 0, `${openReport.sealedRooms.length} sealed`);
const ext = exteriorCells(sealedMass);
log("exterior law: corner exposed, buried not", ext.has("0_0_0") && !ext.has("1_1_4") === false ? ext.has("0_0_0") && !ext.has("4_1_1") : ext.has("0_0_0"), `${ext.size} exterior cells`);
const gateWarn = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: sealedMass, kind: "public" });
log("gate: SEALED_ROOM surfaces as a warning, not an error", gateWarn.warnings.length === 1 && /SEALED_ROOM/.test(gateWarn.warnings[0]) && !gateWarn.errors.some((e) => /SEALED/.test(e)), gateWarn.warnings[0] ?? "");

// --- Phase 6 reachability (ER-04): with authored Door interfaces, computeRooms
// models rooms a player can actually WALK into. Fixture: one solid mass holding
// two enclosed air chambers (A: x1-3, B: x5-7) split by a 1-cell middle wall at
// x=4, sealed by an outer shell. An outer Door (west wall, x0, facing E into A)
// admits a player to A; a connecting Door in the middle wall (x4, facing E from
// A into B) joins A<->B. nl axes: dir E = +x, so pos±off gives the air on the
// wall cell's two faces.
const twoRoomBlocks = [];
{
  const airA = (x, y, z) => x >= 1 && x <= 3 && z >= 1 && z <= 7 && y >= 1 && y <= 2;
  const airB = (x, y, z) => x >= 5 && x <= 7 && z >= 1 && z <= 7 && y >= 1 && y <= 2;
  for (let x = 0; x <= 8; x++) for (let y = 0; y <= 3; y++) for (let z = 0; z <= 8; z++)
    if (!airA(x, y, z) && !airB(x, y, z)) twoRoomBlocks.push({ x, y, z });
}
const outerDoor = { x: 0, y: 1, z: 4, dir: "E", type: "Door" };   // world -> room A
const connDoor  = { x: 4, y: 1, z: 4, dir: "E", type: "Door" };   // room A -> room B
// (1) two-room space with a connecting Door => 2 reachable rooms.
const twoRoomReport = computeRooms(twoRoomBlocks, [outerDoor, connDoor]);
log("rooms: two chambers joined by a Door => 2 reachable rooms",
  twoRoomReport.reachableRooms === 2, `reachableRooms=${twoRoomReport.reachableRooms}`);
// (2) that connecting door removed => far room unreachable (1) AND still surfaced
// as a SEALED_ROOM warning by the gate (unreachable but legal).
const oneDoorReport = computeRooms(twoRoomBlocks, [outerDoor]);
const oneDoorGate = validateUploadedSpace({
  spaceId: 1, tileId: 0, blocks: twoRoomBlocks.map((b) => ({ ...b, type: 2 })),
  kind: "public", interfaces: [outerDoor],
});
log("rooms: connecting Door removed => 1 reachable + SEALED_ROOM warning",
  oneDoorReport.reachableRooms === 1
    && oneDoorGate.warnings.some((w) => /SEALED_ROOM/.test(w))
    && !oneDoorGate.errors.some((e) => /SEALED/.test(e)),
  `reachableRooms=${oneDoorReport.reachableRooms} warnings=${oneDoorGate.warnings.length}`);
// (3) a courtyard mouth is exterior, not a sealed room: an open-top walled well
// (floor + 4 walls, NO ceiling) has interior air that opens to the sky, so it is
// navigable exterior — ZERO sealed rooms, and its interior floor is exterior
// (top face exposed through the mouth). The SAME box WITH a ceiling seals it into
// one hollow — the contrast proves the mouth (open top) is what keeps it exterior.
const courtInteriorAir = (x, y, z) => x >= 1 && x <= 4 && z >= 1 && z <= 4 && y >= 1; // no ceiling
const courtBlocks = [];
for (let x = 0; x <= 5; x++) for (let y = 0; y <= 3; y++) for (let z = 0; z <= 5; z++)
  if (!courtInteriorAir(x, y, z)) courtBlocks.push({ x, y, z });
const courtReport = computeRooms(courtBlocks);
const courtExt = exteriorCells(courtBlocks);
const ceilinged = [];
for (let x = 0; x <= 5; x++) for (let y = 0; y <= 3; y++) for (let z = 0; z <= 5; z++)
  if (!(x >= 1 && x <= 4 && z >= 1 && z <= 4 && y >= 1 && y <= 2)) ceilinged.push({ x, y, z }); // y=3 is ceiling
const ceilingedReport = computeRooms(ceilinged);
log("rooms: courtyard mouth is exterior, not a sealed room",
  courtReport.sealedRooms.length === 0 && courtExt.has("1_0_1") && ceilingedReport.sealedRooms.length === 1,
  `openWell sealed=${courtReport.sealedRooms.length} interiorFloorExterior=${courtExt.has("1_0_1")} ceilinged sealed=${ceilingedReport.sealedRooms.length}`);

// --- engine cache: warm pass hits + snapshots deep-equal; mutation invalidates
const { getCachedSnapshot, cacheMetrics } = await import("../space-cache-bridge.ts");
const corpus = [["L", footLike(16, 16, 8, 8)], ["courtyard", footCourt(14, 14, 4, 4)]];
function footLike(w, d, cw, cd) { const out = []; for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if (!(x >= w - cw && z >= d - cd)) out.push({ x, y: 0, z }); return out; }
function footCourt(w, d, hw, hd) { const x0 = Math.floor((w - hw) / 2), z0 = Math.floor((d - hd) / 2); const out = []; for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if (!(x >= x0 && x < x0 + hw && z >= z0 && z < z0 + hd)) out.push({ x, y: 0, z }); return out; }
let cacheOk = true, equalOk = true;
for (const [name, blocks] of corpus) {
  const cold = await getCachedSnapshot(`corpus-${name}`, blocks);
  const warm = await getCachedSnapshot(`corpus-${name}`, blocks);
  if (JSON.stringify(cold.boundaries) !== JSON.stringify(warm.boundaries) || cold.spawnPoints.length !== warm.spawnPoints.length) equalOk = false;
  const mutated = await getCachedSnapshot(`corpus-${name}`, blocks.concat([{ x: 0, y: 1, z: 0 }])); // extend the cluster upward
  if (JSON.stringify(mutated.boundaries) === JSON.stringify(cold.boundaries)) cacheOk = false; // version must invalidate
}
const cm = cacheMetrics();
log("cache: warm snapshots deep-equal cold", equalOk);
log("cache: block mutation invalidates the version", cacheOk);
log("cache: engine reports hits", cm.hitRate > 0, `hitRate=${(cm.hitRate * 100).toFixed(0)}%`);

// --- ER-06: the cached snapshot carries the space's 2D-Net fingerprint, and a
// server updated_at bump invalidates even when the blocks are byte-identical.
let fpOk = true;
for (const [name, blocks] of corpus) {
  const snap = await getCachedSnapshot(`fp-${name}`, blocks);
  const cold = netFingerprint(blocks).id; // what a cold recompute derives
  if (snap.fingerprint !== cold) fpOk = false;
}
log("cache: snapshot fingerprint deep-equals cold recompute", fpOk,
  `${corpus.length} corpus spaces, snapshot.fingerprint === netFingerprint(blocks).id`);

// updated_at as the version key: same blocks, bumped timestamp => invalidation.
const verBlocks = footLike(10, 10, 3, 3);
const v1 = await getCachedSnapshot("ver-space", verBlocks, "2026-07-05T00:00:00Z"); // cold @ t1
const v1warm = await getCachedSnapshot("ver-space", verBlocks, "2026-07-05T00:00:00Z"); // warm @ t1 (same key)
const v2 = await getCachedSnapshot("ver-space", verBlocks, "2026-07-05T09:00:00Z"); // republish @ t2, identical blocks
const warmHeld = v1warm === v1; // same version key => cache HIT returns the same snapshot object
const bumpInvalidated = v2.version !== v1.version && v2 !== v1; // new updated_at => distinct version, remapped snapshot
log("cache: server updated_at bump invalidates identical-block snapshot", warmHeld && bumpInvalidated,
  `sameKey held=${warmHeld} updatedAtBump invalidated=${bumpInvalidated}`);

// --- elevation: box-derived. Scenes are STORED local (floor at y=0); the
// reducer derives the WORLD grid as `local scene + min_z` (elevate_solids).
// shiftVoxelRle is the TS reference for that lift formula (Rust mirrors it);
// nothing is baked into storage. The live world-grid elevation (flex y=5,
// suites y=9) is asserted end-to-end by the door + spine STDB matrices.
function rleFloor(level) {
  const F = new Int32Array(64 * 64 * 64 * 6);
  for (let x = 20; x <= 44; x++) for (let z = 20; z <= 44; z++) { const o = (z * 64 * 64 + level * 64 + x) * 6; for (let f = 0; f < 6; f++) F[o + f] = 2; }
  const r = []; let c = F[0], n = 1; for (let i = 1; i < F.length; i++) { if (F[i] === c) n++; else { r.push(c, n); c = F[i]; n = 1; } } r.push(c, n); return r;
}
function rleYLevels(r) { const ys = new Set(); let flat = 0; for (let i = 0; i + 1 < r.length; i += 2) { const v = r[i], ct = r[i + 1]; if (v > 1) for (let j = 0; j < ct; j++) ys.add(Math.floor(((flat + j) / 6) / 64) % 64); flat += ct; } return [...ys].sort((a, b) => a - b); }
const localFloor = rleFloor(0);
const upFloor = shiftVoxelRle(localFloor, 4);
log("elevation: shift +4 raises the floor to level 4", JSON.stringify(rleYLevels(upFloor)) === "[4]");
log("elevation: round-trip +4 then -4 is identity", JSON.stringify(shiftVoxelRle(upFloor, -4)) === JSON.stringify(localFloor));
log("elevation: single-floor (dy=0) is a no-op", shiftVoxelRle(localFloor, 0) === localFloor);

// --- simulate matrix via the CLI (the modular-params law)
const out = execFileSync(join(root, "cli", "hubzz"), ["simulate", "--json"], { encoding: "utf8" });
const rows = JSON.parse(out);
const byCase = Object.fromEntries(rows.map((r) => [r.case, r]));
log("simulate: L-shape publishable", byCase["L-shape"]?.publishable === true);
log("simulate: U-shape publishable", byCase["U-shape"]?.publishable === true);
log("simulate: courtyard publishable", byCase["courtyard"]?.publishable === true);
log("simulate: height=3 rejected (quantized tiers)", byCase["height=3"]?.publishable === false);
log("simulate: width=2 rejected (corridor rule)", byCase["width=2"]?.publishable === false);
log("simulate: flex occupancy doubled", byCase["flex-venue"]?.occupancy === 32); // legacy-alias: case NAME predates the flex ruling; kept for docs/qa keying
log("simulate: private without door rejected", byCase["private-no-door"]?.publishable === false);

// --- gate: an undersized/too-short payload is a HARD fail, not a silent pass
// (regression guard — detection drops the sub-minimum component, so the gate
// must reject with NO_VALID_SPACE rather than report valid with zero spaces).
const tiny = [
  { x: 0, y: 0, z: 0, type: 2 }, { x: 1, y: 0, z: 0, type: 2 },
  { x: 0, y: 0, z: 1, type: 2 }, { x: 1, y: 0, z: 1, type: 2 },
];
const tinyGate = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: tiny, kind: "public" });
log("gate: undersized payload fails with NO_VALID_SPACE",
  !tinyGate.valid && tinyGate.spaceCount === 0 && tinyGate.errors.some((e) => /NO_VALID_SPACE/.test(e)));
const emptyGate = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: [], kind: "public" });
log("gate: empty payload fails with NO_VALID_SPACE",
  !emptyGate.valid && emptyGate.spaceCount === 0 && emptyGate.errors.some((e) => /NO_VALID_SPACE/.test(e)));
const disconnectedGate = validateUploadedSpace({
  spaceId: 1,
  tileId: 0,
  blocks: roomBlocks.concat(roomBlocks.map((b) => ({ ...b, x: b.x + 16 }))),
  kind: "public",
});
log("gate: one Space payload cannot contain two flood-fill clusters",
  !disconnectedGate.valid && disconnectedGate.spaceCount === 2
    && disconnectedGate.errors.some((e) => /MULTIPLE_SPACES/.test(e)));

// --- spawn URL: each coordinate is a signed integer (regression guard for the
// regex fix — "1-2"/"--1" no longer mis-parse).
const { SpawningSystem } = await import("../core/spawning-system.ts");
const { SpaceDetectionEngine } = await import("../core/space.ts");
const spawnSys = new SpawningSystem(new BlockNodeGraph(), new SpaceDetectionEngine());
const goodUrl = spawnSys.parseSpawnURL("hubzz.com/-4,3/5,6,-1");
log("spawnURL: signed coords parse", !!goodUrl && goodUrl.zoneCoordinates.x === -4 && goodUrl.blockCoordinates.z === -1);
log("spawnURL: malformed coords rejected", spawnSys.parseSpawnURL("hubzz.com/1-2,0/5,6,7") === null);

// URL height is a query, not authored state: descend the requested column to
// the FIRST standable Up-face, even when the URL starts far above the Space.
// Only a column with no floor below may relocate horizontally.
const airGraph = new BlockNodeGraph();
for (const [x, y, z] of [
  [1, 1, 0], [1, 1, 10], // same column: the upper floor must catch the fall first
  [4, 1, 0],              // nearest fallback for an empty requested column
]) {
  const node = createBlockNode(`air_${x}_${y}_${z}`, "air-zone", { x, y, z });
  node.flags.walkableTop = false; // authored flags must not control derived landing
  airGraph.addBlock(node);
}
for (const node of airGraph.getAllBlocks()) airGraph.autoLinkBlock(node.id);
const airSpawn = new SpawningSystem(airGraph, new SpaceDetectionEngine());
const highLanding = airSpawn.spawnPlayerAtURL("hubzz.com/0,0/1,1,50");
log("spawnURL: high-air load falls to first derived floor in its column",
  highLanding.success && highLanding.finalPosition?.z === 11 && highLanding.standingOnBlock?.p.z === 10,
  highLanding.success ? `surface=${highLanding.finalPosition?.z} drop=${highLanding.dropDistance}` : highLanding.failureReason);
const relocatedLanding = airSpawn.spawnPlayerAtURL("hubzz.com/0,0/3,1,50");
log("spawnURL: horizontal relocation happens only when the requested column has no floor",
  relocatedLanding.success && relocatedLanding.finalPosition?.x === 4.5 && relocatedLanding.finalPosition?.z === 1,
  relocatedLanding.success ? `landed=${relocatedLanding.finalPosition?.x},${relocatedLanding.finalPosition?.y},${relocatedLanding.finalPosition?.z}` : relocatedLanding.failureReason);
const ringGraph = new BlockNodeGraph();
for (const [x, y] of [[1, 1], [2, 1]]) {
  ringGraph.addBlock(createBlockNode(`ring_${x}_${y}`, "ring-zone", { x, y, z: 0 }));
}
for (const node of ringGraph.getAllBlocks()) ringGraph.autoLinkBlock(node.id);
const ringSpawn = new SpawningSystem(ringGraph, new SpaceDetectionEngine())
  .spawnPlayerAtURL("hubzz.com/0,0/2,2,50");
log("spawnURL: TS fallback matches Rust Chebyshev-ring ordering",
  ringSpawn.success && ringSpawn.finalPosition?.x === 1.5 && ringSpawn.finalPosition?.y === 1.5,
  ringSpawn.success ? `landed=${ringSpawn.finalPosition?.x},${ringSpawn.finalPosition?.y}` : ringSpawn.failureReason);

// --- pathfinder node cap (BW-01, the upstream server Lesson A6): a long path succeeds
// uncapped, and the SAME query with a tiny maxNodes early-outs to no-path
// (mirrors the upstream server's pathfinder node_limit case — docs/MMO-PATTERNS.md A6).
const { findPath: gridFindPath } = await import("../core/pathfinder.ts");
const corridorWalkable = (x, y) => y === 0 && x >= 0 && x < 64;
const longPath = gridFindPath({ x: 0, y: 0 }, { x: 63, y: 0 }, corridorWalkable);
log("pathfinder: 64-cell corridor path found uncapped", longPath.length === 64, `steps=${longPath.length}`);
const cappedPath = gridFindPath({ x: 0, y: 0 }, { x: 63, y: 0 }, corridorWalkable, { maxNodes: 4 });
log("pathfinder: same query with maxNodes=4 returns no-path", cappedPath.length === 0, `steps=${cappedPath.length}`);

// --- space-spine bridge (ER-08): the ONE spine law shared by CLI + Dollhouse ---
// spineFromRows must (a) place the column at the SIDE-TAPE anchor — the
// structure box's max-x, max-depth corner cell (ruling #15; formula-identical
// to the reducer's use_spine anchor, which accepts rides only at this cell)
// and (b) order floors stably by min_z in that same module.
const { spineFromRows, spineColumnFromRows } = await import("../space-spine.ts");
const towerRows = [
  { spaceId: "t-suites", label: "Suites", minZ: 8, minX: 20, minY: 20, maxX: 40, maxY: 40 },
  { spaceId: "t-lobby", label: "Lobby", minZ: 0, minX: 16, minY: 16, maxX: 48, maxY: 48 },
  { spaceId: "t-flex", label: "Flex", minZ: 4, minX: 18, minY: 18, maxX: 44, maxY: 44 },
];
const towerSpine = spineFromRows("t", towerRows);
const towerCol = spineColumnFromRows(towerRows);
log(
  "spine: column at the side-tape anchor (structure box max corner; one formula on a NON-uniform stack)",
  towerCol.x === 48 && towerCol.z === 48
    && towerSpine.x === towerCol.x && towerSpine.z === towerCol.z,
  `col=(${towerCol.x},${towerCol.z})`,
);
log(
  "spine: floors elevation-ordered by the engine (min_z asc)",
  towerSpine.floors.map((f) => f.spaceId).join(",") === "t-lobby,t-flex,t-suites"
    && towerSpine.floors.map((f) => f.label).join(",") === "Lobby,Flex,Suites",
  towerSpine.floors.map((f) => `${f.label}@${f.minZ}`).join(" / "),
);
log("spine: single-floor structure has no spine", spineFromRows("s", towerRows.slice(0, 1)) === null);

// --- T3: the side-tape servability rule (validation rule #8 rewritten) -------
// The old "continuous interior block column" law was vacuous — the floor-
// completeness rule already forces a spanning column under every legal
// payload. The new law (ruling #15): every story must offer a standable
// surface at its base level so the auto-added side-tape can serve it.
{
  // (a) a supported multi-story stack whose floors do NOT fully overlap
  // validates — its stories connect via the tape, not a mandatory column
  const stepped = [];
  for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) stepped.push({ x, y: 0, z, type: 2 }); // ground floor 6x6
  for (let x = 6; x < 9; x++) for (let z = 2; z < 6; z++) stepped.push({ x, y: 0, z, type: 2 }); // trench floor (connected)
  for (const [x, top] of [[6, 1], [7, 2], [8, 3]]) for (let y = 1; y <= top; y++) for (let z = 2; z < 6; z++) stepped.push({ x, y, z, type: 2 }); // supported steps
  for (let x = 9; x < 13; x++) for (let z = 0; z < 4; z++) for (let y = 0; y <= 3; y++) if (y === 0 || y === 3 || x === 9) stepped.push({ x, y, z, type: 2 }); // top floor slab at y=3, fully offset, supported at x=9
  const rStepped = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: stepped, kind: "public" });
  log("T3: supported stack with non-overlapping floors validates via the side-tape",
    rStepped.valid, rStepped.errors[0] ?? "");

  // (b) a floor under a 1-high ceiling fails — the case the OLD rule missed:
  // the ground story exists (air at l+1) but has NO headroom (solid at l+2) —
  // unusable, so the tape can't serve it. (A fully buried level is a legal
  // solid mound — not a story — and passes.)
  const lowCeiling = [];
  for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
    lowCeiling.push({ x, y: 0, z, type: 2 }); // floor
    lowCeiling.push({ x, y: 2, z, type: 2 }); // the 1-high ceiling (full cover)
    if (x === 0 || z === 0 || x === 5 || z === 5)
      for (let y = 1; y <= 3; y++) lowCeiling.push({ x, y, z, type: 2 }); // walls hold it together
  }
  const rLowCeiling = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: lowCeiling, kind: "public" });
  log("T3: floor under a 1-high ceiling rejected (LEVEL_NOT_SERVABLE)",
    !rLowCeiling.valid && rLowCeiling.errors.some((e) => /no headroom/.test(e)),
    rLowCeiling.errors[0] ?? "");

  const entombed = [];
  for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
    entombed.push({ x, y: 0, z, type: 2 });
    entombed.push({ x, y: 1, z, type: 2 }); // fully buried ground = solid mound
  }
  const rEntombed = validateUploadedSpace({ spaceId: 1, tileId: 0, blocks: entombed, kind: "public" });
  log("T3: fully buried level is a legal solid mound (not a story)",
    !rEntombed.errors.some((e) => /no headroom|no standable surface/.test(e)),
    rEntombed.errors[0] ?? "");
}

// --- scene-codec + space-links unit pins (the deduped TS laws in isolation) ---
const { decodeSceneBlocks, encodeSceneBlocks } = await import("../scene-codec.ts");

// decode: 6 flat slots = 1 cell; value>1 = solid; duplicate slots dedup to one cell
const dec1 = decodeSceneBlocks([2, 6]);
log("codec: one full RLE run decodes to one cell", dec1.length === 1 && dec1[0].x === 0 && dec1[0].y === 0 && dec1[0].z === 0);
const dec2 = decodeSceneBlocks([0, 3, 2, 6]); // straddles cells 0 and 1
log("codec: partial-slot run marks both touched cells", dec2.length === 2 && dec2[1].x === 1, JSON.stringify(dec2.map(b => b.x)));
const dec3 = decodeSceneBlocks([1, 12]); // value 1 = air-ish, not solid
log("codec: value 1 is not solid", dec3.length === 0);
const dec4 = decodeSceneBlocks([2, 6 * 64]); // a full x-row: y stays 0
log("codec: cell coords follow x -> y -> z ordering", dec4.length === 64 && dec4[63].x === 63 && dec4[63].y === 0);

// encode: the zone builder publishes real sparse solids through the same
// editor face-slot stream that decodeSceneBlocks consumes.
const encodedL = encodeSceneBlocks([
  { x: 2, y: 0, z: 3, type: 2 },
  { x: 3, y: 0, z: 3, type: 2 },
  { x: 2, y: 0, z: 4, type: 2 },
]);
const decodedL = decodeSceneBlocks(encodedL);
log("codec: encodeSceneBlocks preserves sparse L-shape solids",
  JSON.stringify(decodedL) === JSON.stringify([
    { x: 2, y: 0, z: 3, type: 2 },
    { x: 3, y: 0, z: 3, type: 2 },
    { x: 2, y: 0, z: 4, type: 2 },
  ]), JSON.stringify(decodedL));
log("codec: encodeSceneBlocks emits a complete editor face-slot stream",
  encodedL.reduce((sum, value, i) => i % 2 ? sum + value : sum, 0) === 64 * 64 * 64 * 6,
  `${encodedL.length / 2} runs`);

// sceneOpenings: authored interfaces preferred; legacy openings lifted; door count dedups
const legacyScene = { openings: [{ side: "zMin", at: 16, from: 30, to: 32, fromY: 0, h: 2 }] };
const liftedScene = sceneOpenings(legacyScene);
// openings lift PER-CELL: a from=30..to=32 door is 3 door cells (the law the
// interfaces-authored twin round-trips against)
log("codec: legacy openings lift to per-cell door interfaces",
  liftedScene.interfaces.length === 3 && liftedScene.doors === 3, `doors=${liftedScene.doors}`);
const authoredScene = { openings: [], interfaces: [{ type: "Window", dir: "N", x: 1, z: 1, y: 1 }] };
log("codec: authored interfaces preferred; windows are not doors",
  sceneOpenings(authoredScene).interfaces.length === 1 && sceneOpenings(authoredScene).doors === 0);

// deriveLinks: reducer-mirror branches in isolation
const dl = (openings, boxes = new Map(), zone) => engineDeriveLinks({ spaceId: "s", zoneX: 2, zoneY: 3 }, openings, boxes, undefined, zone);
// CD-05: a targetless door RESOLVES — with no other Space containing the
// landing, to the zone's derived exterior Public remainder Space — and, being
// a ground-floor exterior door, derives its street-side :entry: reverse owned
// by that remainder Space (activation in GLOBAL coordinates: zone 2,3 origin
// is 128,192).
const zoneExit = dl([{ side: "zMin", at: 16, from: 30, to: 32, fromY: 0 }]);
log("links: targetless door resolves to the exterior remainder Space",
  zoneExit.length === 2 && zoneExit[0].toWorld === "space:zone:2:3:public-remainder"
    && zoneExit[0].linkId === "s:door:0" && zoneExit[0].ownerId === "s",
  zoneExit[0]?.toWorld ?? "");
log("links: zone-exit spawn steps OUT through the wall",
  zoneExit[0].spawnZ === 16 - 1 + 0.5, `spawnZ=${zoneExit[0].spawnZ}`);
log("links: exterior door derives its street-side :entry: reverse",
  zoneExit[1].linkId === "s:entry:0" && zoneExit[1].toWorld === "space:s"
    && zoneExit[1].ownerId === "zone:2:3:public-remainder"
    && zoneExit[1].x === 2 * 64 + 31 + 0.5 && zoneExit[1].z === 3 * 64 + 16 - 1 + 0.5
    && zoneExit[1].spawnX === 31.5 && zoneExit[1].spawnZ === 16.5,
  `${zoneExit[1]?.linkId} @(${zoneExit[1]?.x},${zoneExit[1]?.z}) land (${zoneExit[1]?.spawnX},${zoneExit[1]?.spawnZ})`);
// Landing resolution with zone claims: a doormat on ground the source's own
// FLOOR claims is an INTERNAL opening (no link, index still advances); a
// doormat on a neighbor's claimed floor at the source's level is a 1:1 door
// into that Space. Horizontal truth is the floor CELLS, never the box.
const fullCells = (b) => {
  const s = new Set();
  for (let z = b.minY; z <= b.maxY; z++) for (let x = b.minX; x <= b.maxX; x++) s.add(z * 64 + x);
  return s;
};
const srcBox = { minX: 28, minY: 12, maxX: 34, maxY: 20, minZ: 0, maxZ: 0 };
const srcClaim = { box: srcBox, cells: fullCells(srcBox) };
const internal = dl([{ side: "zMin", at: 16, from: 30, to: 32, fromY: 0 },
                     { side: "zMax", at: 20, from: 30, to: 32, fromY: 0 }],
  new Map(), { source: srcClaim, neighbors: new Map() });
log("links: landing on the source's own claimed floor is internal — no link, index advances",
  internal.filter((l) => l.linkId.includes(":door:")).length === 1
    && internal[0].linkId === "s:door:1",
  internal.map((l) => l.linkId).join(","));
const viaNeighbor = dl([{ side: "zMin", at: 12, from: 30, to: 32, fromY: 0 }],
  new Map(), {
    source: srcClaim,
    neighbors: new Map([["nbr", {
      box: { minX: 28, minY: 5, maxX: 34, maxY: 11, minZ: 0, maxZ: 0 },
      cells: fullCells({ minX: 28, minY: 5, maxX: 34, maxY: 11 }),
    }]]),
  });
log("links: landing on a neighbor's claimed floor is a 1:1 door into that Space",
  viaNeighbor.length === 1 && viaNeighbor[0].toWorld === "space:nbr",
  viaNeighbor[0]?.toWorld ?? "");
// The Codex-reviewed counterexample (rulings 8/10 — the box is an INDEX): an
// L-shaped source whose bite swallows the doormat. Inside the AABB, on NO
// floor cell -> a REAL exterior doorway: it must resolve to the remainder and
// derive its :entry: reverse, never be misread as internal.
const bittenCells = new Set(fullCells(srcBox));
for (let z = 12; z <= 16; z++) for (let x = 30; x <= 34; x++) bittenCells.delete(z * 64 + x);
const notch = dl([{ side: "zMax", at: 11, from: 30, to: 32, fromY: 0 }], // doormat (31,12): in AABB, in the bite
  new Map(), { source: { box: srcBox, cells: bittenCells }, neighbors: new Map() });
log("links: doormat inside the AABB but outside the floor is a REAL exterior door",
  notch.length === 2 && notch[0].toWorld === "space:zone:2:3:public-remainder"
    && notch[1].linkId === "s:entry:0",
  notch.map((l) => `${l.linkId}->${l.toWorld}`).join(",") || "no links");
const linked = dl(
  [{ side: "xMax", at: 48, from: 30, to: 32, fromY: 0, targetSpaceId: "t" }],
  new Map([["t", { minX: 10, minY: 20, maxX: 20, maxY: 30 }]]),
);
log("links: DoorLink targets the space and spawns at its box centre",
  linked[0].toWorld === "space:t" && linked[0].spawnX === 15.5 && linked[0].spawnZ === 25.5,
  `${linked[0].toWorld} @ ${linked[0].spawnX},${linked[0].spawnZ}`);
const guarded = dl([
  { side: "zMin", at: NaN, from: 30, to: 32, fromY: 0 },          // malformed: skipped, no index advance
  { side: "zMin", at: 16, from: 30, to: 32, fromY: 1 },            // window: skipped
  { side: "zMin", at: 16, from: 30, to: 32, fromY: 0 },            // the only real door
]);
log("links: malformed + window openings skip WITHOUT advancing the door index",
  guarded.filter((l) => l.linkId.includes(":door:")).length === 1
    && guarded[0].linkId === "s:door:0", guarded[0]?.linkId ?? "");

// --- CC-06 landing-hint law: box centre is a HINT, snap_landing is the law --
// The measured counterexample: a LEGAL chunky L (16x16 box at (16,16), both
// legs 4 wide, 12x12 bite at the max corner, 112 floor tiles >= 16) puts the
// box centre (23,23) inside the bite with the nearest standable cell at
// Chebyshev 4 — beyond use_door's r<=3 snap ring. deriveLinks therefore
// refines the hint via nearestStandable (unbounded, same ring order) when the
// target's grid exists; a standable centre returns itself, keeping every
// rectangular scene's space_link bytes frozen. Mirrors the laws crate's
// nearest_rescues_the_chunky_l_box_centre.
{
  const { nearestStandable } = await import("../space-links.ts");
  const lFloor = [];
  for (let x = 16; x <= 31; x++) for (let z = 16; z <= 31; z++)
    if (!(x >= 20 && z >= 20)) lFloor.push({ x, y: 0, z, type: 2 });
  const lGrid = walkableHeights(lFloor.concat(synthesizeShellWalls(lFloor, 2)), 64);
  log("hint: chunky-L box centre is NOT standable (the counterexample is real)",
    lGrid[23 * 64 + 23] === 0 && lFloor.length === 112, `h(23,23)=${lGrid[23 * 64 + 23]}`);
  log("hint: nearestStandable rescues the centre to the inner corner (19,19) at r=4",
    JSON.stringify(nearestStandable(lGrid, 23.5, 23.5)) === JSON.stringify([19.5, 19.5, 1]));
  const lBoxes = new Map([["l", { minX: 16, minY: 16, maxX: 31, maxY: 31 }]]);
  const door = [{ side: "xMax", at: 48, from: 30, to: 32, fromY: 0, targetSpaceId: "l" }];
  const unrefined = dl(door, lBoxes);
  const refined = engineDeriveLinks({ spaceId: "s", zoneX: 2, zoneY: 3 }, door, lBoxes,
    new Map([["l", lGrid]]));
  log("hint: DoorLink to the chunky L lands on the nearest standable cell, not the bite",
    unrefined[0].spawnX === 23.5 && refined[0].spawnX === 19.5 && refined[0].spawnZ === 19.5,
    `box-centre ${unrefined[0].spawnX},${unrefined[0].spawnZ} -> ${refined[0].spawnX},${refined[0].spawnZ}`);
  // frozen-bytes pin: a rectangular target's standable centre is its own
  // nearest cell — grids present or absent, the hint is byte-identical.
  const rFloor = [];
  for (let x = 10; x <= 20; x++) for (let z = 20; z <= 30; z++) rFloor.push({ x, y: 0, z, type: 2 });
  const rGrid = walkableHeights(rFloor.concat(synthesizeShellWalls(rFloor, 2)), 64);
  const rBoxes = new Map([["t", { minX: 10, minY: 20, maxX: 20, maxY: 30 }]]);
  const rDoor = [{ side: "xMax", at: 48, from: 30, to: 32, fromY: 0, targetSpaceId: "t" }];
  const rPlain = dl(rDoor, rBoxes)[0];
  const rWithGrid = engineDeriveLinks({ spaceId: "s", zoneX: 2, zoneY: 3 }, rDoor, rBoxes,
    new Map([["t", rGrid]]))[0];
  log("hint: rectangular target keeps its box-centre hint byte-for-byte (frozen contract)",
    rPlain.spawnX === 15.5 && rPlain.spawnZ === 25.5
      && rWithGrid.spawnX === rPlain.spawnX && rWithGrid.spawnZ === rPlain.spawnZ,
    `${rWithGrid.spawnX},${rWithGrid.spawnZ}`);
}

// --- CC-02 canon gates (docs/CANON-LEDGER.md rulings 6 + 7) ------------------
// (a) vocabulary gate: kind vocabulary is public / private / FLEX. The banned
// token must not appear anywhere in repo source (engine/apps/cli/spacetime/src/
// ci/docs, minus docs/qa, node_modules, dist, target). A line is exempt ONLY
// when it carries a documented marker: "legacy-alias" (a kept legacy identifier,
// annotated at the site), "stale vocab" (the ledger's own record of the ban), or
// the third-party asset identifier "venueChair"/"Venue Chair" (Kenney furniture
// model FILENAMES shipped in apps/space-editor/public/models — not kind vocab;
// JSON cannot carry an annotation, so the identifier itself is the pattern).
{
  // Not preceded by a letter, so ordinary words that merely contain the token
  // (e.g. "Revenue" in the skin's analytics card) are not kind vocab.
  const banned = /(?<![A-Za-z])venue/i;                     // legacy-alias: the banned token itself, exempt via this marker
  const exempt = /legacy-alias|stale vocab|venue ?chair/i;  // the documented exemption patterns
  const srcExt = /\.(ts|tsx|js|mjs|cjs|rs|md|json)$/;
  // viz/saved/ is the dated checkpoint archive — the owner's decisions and
  // provenance anchors recorded verbatim, including what the ORIGINAL prototype
  // palette was called. Those records are history and must not be rewritten to
  // satisfy a vocabulary gate; skipped like docs/qa.
  const skip = /(^|\/)(node_modules|dist|target|\.git)(\/|$)|(^|\/)docs\/qa(\/|$)|(^|\/)saved(\/|$)/;
  // The skin (../src, ../tests) and the viz (../viz) are in this repo since the
  // consolidation, so the gate finally covers them: stale vocab re-entering
  // the skin is the exact failure this ruling was written for.
  const dirs = ["engine", "apps", "cli", "spacetime/src", "ci", "docs",
                "../src", "../tests", "../viz"].filter((d) => existsSync(join(root, d)));
  const files = collectSourceFiles(dirs, srcExt, skip);
  const hits = lineHits(files, banned, exempt);
  log("canon: vocabulary gate — stale kind vocab absent from repo source (ruling 6)",
    files.length > 100 && hits.length === 0, hits.length ? hits.slice(0, 5).join(" ") : `${files.length} files clean`);
}
// (b) architecture vocabulary: the physical partition-volume model and the
// authored TeleportColumn model were explicitly superseded. Unlike compatibility
// readers (`openings`, `upsert_scene`, pre-standable fallback), these constructs
// have no migration role and must not remain discoverable in the engine API.
{
  const forbidden = /\b(?:PARTITION_GAP|GAP_SPLIT|EFFECTIVE_CELL_SIZE|BlockPlacementSystem|SpatialHashGrid|TeleportColumn|TeleportalColumn|TeleportalManager|createVerticalTeleportal|createInterZoneTeleportal)\b/;
  const files = collectSourceFiles(["engine"], /\.ts$/);
  const retiredFiles = new Set([
    "engine/core/partition.ts",
    "engine/core/spatial-hash.ts",
    "engine/core/teleportals.ts",
  ]);
  const hits = lineHits(files, forbidden);
  hits.push(...files
    .map((file) => file.slice(root.length + 1))
    .filter((file) => retiredFiles.has(file)));
  log("canon: superseded gap/column and orphan utility APIs are absent",
    hits.length === 0, hits.length ? hits.slice(0, 12).join(" ") : `${files.length} engine files clean`);
}
// (b) palette pin: the canon palette is public 0xa855f7 purple / private
// 0xf97316 orange / flex 0x22c55e green. Kind colors mark spaces on the CITY
// MAP only, never dollhouse walls (ruling 7).
//
// Ruling 7 names the SKIN's src/app/zone/constants.tsx BLOCK_TYPES as the
// source of truth. Until the consolidation that file lived in another repo, so
// this gate could only pin the Dollhouse COPY — which is exactly how the wrong
// palette kept re-entering through the source (CANON-LEDGER "Palette/vocab were
// unpinned"). Both are pinned now.
const CANON_PALETTE = { public: 0xa855f7, private: 0xf97316, flex: 0x22c55e };
{
  const dhSrc = readFileSync(join(root, "apps", "world-client", "src", "spatial", "Dollhouse.ts"), "utf8");
  const m = dhSrc.match(/KIND_COLORS[^=]*=\s*\{([^}]*)\}/);
  const parsed = {};
  for (const [, k, v] of (m?.[1] ?? "").matchAll(/(\w+)\s*:\s*0x([0-9a-fA-F]+)/g)) parsed[k] = parseInt(v, 16);
  const exact = Object.keys(parsed).length === 3
    && Object.entries(CANON_PALETTE).every(([k, v]) => parsed[k] === v);
  log("canon: Dollhouse KIND_COLORS pinned to the canon palette (ruling 7)",
    exact, JSON.stringify(Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, "0x" + v.toString(16)]))));
}
// (b2) the source of truth itself: skin BLOCK_TYPES. Enum member -> kind is
// Public->public, Commercial->private (the enum name is legacy; its value is
// the canon kind), Flex->flex.
{
  const skinConstants = join(root, "..", "src", "app", "zone", "constants.tsx");
  const ENUM_TO_KIND = { Public: "public", Commercial: "private", Flex: "flex" };
  let ok = false, detail = "skin constants.tsx not found";
  if (existsSync(skinConstants)) {
    const src = readFileSync(skinConstants, "utf8");
    const body = src.match(/BLOCK_TYPES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
    const parsed = {};
    for (const [, member, hex] of body.matchAll(/BlockCategory\.(\w+)\s*\]\s*:\s*\{[\s\S]*?color:\s*0x([0-9a-fA-F]+)/g)) {
      if (ENUM_TO_KIND[member]) parsed[ENUM_TO_KIND[member]] = parseInt(hex, 16);
    }
    ok = Object.keys(parsed).length === 3
      && Object.entries(CANON_PALETTE).every(([k, v]) => parsed[k] === v);
    detail = JSON.stringify(Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, "0x" + v.toString(16)])));
  }
  log("canon: skin BLOCK_TYPES is the canon palette (ruling 7, source of truth)", ok, detail);
}
// (b3) no drifted kind hex anywhere in the skin. The original prototype's
// MISLABELLED palette (its blue was actually flex)
// kept being reintroduced as CSS classes in the zone-builder panels, so the
// literals are banned outright rather than pinned per-site.
{
  const drifted = /#?(?:6FA8E2|E2B85E|7ED36E)\b/i;
  const exempt = /MISLABELLED|legacy-alias/i;
  const skinRoots = ["../src", "../tests"].filter((d) => existsSync(join(root, d)));
  const files = collectSourceFiles(skinRoots, /\.(ts|tsx)$/, /(^|\/)node_modules(\/|$)/);
  const hits = lineHits(files, drifted, exempt);
  log("canon: drifted prototype kind hexes absent from the skin (ruling 7)",
    files.length > 0 && hits.length === 0,
    hits.length ? hits.slice(0, 5).join(" ") : `${files.length} skin files clean`);
}

// (b4) the BRAND tokens: AGENTS.md is the owner's brand model — primary accent
// #735FFA (Hubzz Purple) and error #FF5A5A. theme.css's Tailwind-layer
// --primary/--destructive silently computed to OTHER hexes for weeks because
// nothing read theme.css; ~105 *-primary/*-destructive consumers rendered
// off-brand. Pin both layers to the AGENTS.md hexes.
{
  const themeCss = join(root, "..", "src", "styles", "theme.css");
  let ok = false, detail = "theme.css not found";
  if (existsSync(themeCss)) {
    const src = readFileSync(themeCss, "utf8");
    const primaries = [...src.matchAll(/--primary:\s*([^;]+);/g)].map((m) => m[1].trim().toLowerCase());
    const destructives = [...src.matchAll(/--destructive:\s*([^;]+);/g)].map((m) => m[1].trim().toLowerCase());
    const brandOk = primaries.length >= 2 && primaries.every((v) => v === "#735ffa");
    const dangerOk = destructives.length >= 2 && destructives.every((v) => v === "#ff5a5a");
    const figmaOk = /--figma-color-bg-brand:\s*#735ffa/i.test(src) && /--figma-color-bg-danger:\s*#ff5a5a/i.test(src);
    ok = brandOk && dangerOk && figmaOk;
    detail = `primary=${primaries.join(",")} destructive=${destructives.join(",")}`;
  }
  log("canon: theme.css brand tokens match AGENTS.md (#735FFA / #FF5A5A, both layers)", ok, detail);
}

// --- CC-04: the zone edge reserve, and WHICH LAYER enforces it --------------
// The reserve is SETTLED at 4 (2 road + 2 sidewalk), documented in
// docs/SPEC-ZONE-ARCHITECTURE.md as "the 56x56-in-64x64 buildable margin". It
// is NOT an open question — see CANON-LEDGER "The zone edge reserve is 4".
//
// It is a PLACEMENT rule, and the layering is the thing this block pins:
//   - the SHAPE gate (validateUploadedSpace) is placement-BLIND. A Space's
//     shape is judged independently of where the Space sits, exactly as the
//     Python reference does it — Zone.add_voxel -> _check_inset
//     (zone_engine/core/models.py) enforces the inset, Zone's validator does
//     not. Every origin-anchored fixture in the oracle cross-check (M1-M8)
//     depends on this; teaching the shape gate about placement fails M5.
//   - the AUTHORING path enforces it, via zoneEdgeReserveViolations()
//     (engine/core/constants.ts), called from ../src/app/zone/validation.ts.
//
// Measured on the vendored oracle, 64-wide:
//   x=0..3 reject · x=4 accept · x=59 accept · x=60..63 reject  (56x56 core)
// The oracle's INSET_SIZE is now ROAD_WIDTH + SIDEWALK_WIDTH and reports 4; it
// once read 2 ("Sidewalk width"), the sidewalk half alone, and that half-rule
// misled this repo's own canon once. The skin no longer carries a road-width
// constant of its own: it derives the road/sidewalk render bands from
// ZONE_ROAD_WIDTH/ZONE_SIDEWALK_WIDTH and draws them ON the reserved tiles
// (../src/app/zone/zone-reserve-bands.ts, pinned by its own suite). It used to
// draw ribbons OUTSIDE the grid that reserved no tiles. Per ruling 18 an
// ordinary zone has no merge exception; the 8 pre-merged landmark zones lift
// the reserve on interior seams and keep it on the outer perimeter.
//
// Three assertions, one per layer. If you move enforcement into the shape gate,
// (a) fails and M5 fails with it — that is the signal to put it back.
{
  const edgeSpace = [];
  for (let x = 0; x < 6; x++) for (let z = 10; z < 16; z++) for (let y = 0; y < 2; y++)
    edgeSpace.push({ x, y, z, type: 2 });

  // (a) the shape gate stays placement-blind
  const verdict = validateUploadedSpace({
    spaceId: 1, tileId: 0, blocks: edgeSpace, kind: "PUBLIC", interfaces: [],
  });
  log("canon: the SHAPE gate is placement-blind (the reserve is not a shape rule)",
    verdict.valid === true,
    `x0=0 valid=${verdict.valid} errors=${JSON.stringify(verdict.errors)}`);

  // (b) the placement rule flags exactly the cells outside [4, 59]
  const cells = edgeSpace.map(({ x, z }) => ({ x, z }));
  const flagged = zoneEdgeReserveViolations(cells);
  const expected = cells.filter((c) => c.x < 4 || c.x > 59 || c.z < 4 || c.z > 59);
  const clear = zoneEdgeReserveViolations([
    { x: 4, z: 4 }, { x: 59, z: 59 }, { x: 30, z: 30 },
  ]);
  log("canon: the PLACEMENT rule flags the road/sidewalk band, buildable [4, 59]",
    flagged.length === expected.length && flagged.length > 0 && clear.length === 0,
    `flagged=${flagged.length}/${cells.length} expected=${expected.length} corners-clear=${clear.length === 0}`);

  // (c) the authoring path actually calls it — a deleted call is silent otherwise
  const skinValidation = join(root, "..", "src", "app", "zone", "validation.ts");
  const wired = existsSync(skinValidation)
    && /zoneEdgeReserveViolations\s*\(/.test(readFileSync(skinValidation, "utf8"));
  log("canon: the AUTHORING path enforces the reserve (src/app/zone/validation.ts)",
    wired,
    wired ? "validation.ts calls zoneEdgeReserveViolations()" : `not wired at ${skinValidation}`);
}

// --- CC-05: the zone edge reserve names BOTH parts -------------------------
// The reserve is 2 road + 2 sidewalk = 4 per edge. The oracle exposes only
// INSET_SIZE = 2 ("Sidewalk width"), and reading that as "the zone inset" ships
// half the rule — it already misled this repo's own canon once. Both parts are
// named in engine/core/constants.ts and must stay named and must stay summing
// to the reserve. Declaring them changes no verdict; this asserts the NAMES and
// the ARITHMETIC. CC-04 above asserts WHERE the rule is enforced.
{
  const ok =
    ZONE_ROAD_WIDTH === 2 &&
    ZONE_SIDEWALK_WIDTH === 2 &&
    ZONE_EDGE_RESERVE === ZONE_ROAD_WIDTH + ZONE_SIDEWALK_WIDTH &&
    ZONE_EDGE_RESERVE === 4 &&
    ZONE_BUILDABLE_MIN === 4 &&
    ZONE_BUILDABLE_MAX === 59 &&
    ZONE_BUILDABLE_MAX === ZONE_GRID_SIZE - 1 - ZONE_EDGE_RESERVE;
  log("canon: the zone edge reserve names road AND sidewalk, and they sum to it",
    ok,
    `road=${ZONE_ROAD_WIDTH} sidewalk=${ZONE_SIDEWALK_WIDTH} reserve=${ZONE_EDGE_RESERVE} buildable=[${ZONE_BUILDABLE_MIN}, ${ZONE_BUILDABLE_MAX}]`);
}

// --- CC-08: the zone<->world transform lives in exactly ONE module ----------
// The skin's zone-local -> three.js transform is
// `(coord - (GRID_SIZE - 1) / 2) * EFFECTIVE_CELL_SIZE`, and its inverse. Five
// sites re-implemented it by hand rather than calling
// src/components/zone/three/coordinates.ts, including a local function with the
// SAME NAME as the canonical export and a pair of bare literals
// (`EFFECTIVE_CELL_SIZE = 1.125`, `GRID_SIZE = 64`) standing in for the imports.
//
// Nothing caught it, because a duplicated derivation that AGREES is invisible:
// every test passes, both copies are right, and the drift only appears the day
// one constant moves. That is the failure this gate exists for — it does not
// check the arithmetic (the unit tests do), it checks that there is only one
// copy of it to be wrong.
//
// The centring constant is the marker: it appears nowhere else in the codebase
// and cannot be written by accident. Exempt the module that owns it, and its
// tests, which must name the thing they pin.
{
  const centring = /\(\s*GRID_SIZE\s*-\s*1\s*\)\s*\/\s*2/;
  const owner = /src\/components\/zone\/three\/coordinates\.(ts|test\.ts)$/;
  const skip = /(^|\/)(node_modules|dist|target|\.git)(\/|$)/;
  const files = collectSourceFiles(["../src", "../tests"], /\.(ts|tsx)$/, skip)
    .filter((file) => !owner.test(file));
  const hits = lineHits(files, centring);
  log("canon: one zone<->world transform — no hand-inlined copies (CC-08)",
    files.length > 20 && hits.length === 0,
    hits.length ? hits.slice(0, 8).join(" ")
                : `${files.length} skin files clean; transform owned by three/coordinates.ts`);
}
// Companion pin: the canonical module must actually still hold the transform.
// Without this the gate above passes trivially the day someone deletes it.
{
  const source = readFileSync(
    join(root, "../src/components/zone/three/coordinates.ts"), "utf8");
  const exports = ["logicalToWorld", "worldToLogicalExact", "worldToLogical",
                   "snapWorldToCell", "isLogicalOnGrid"];
  const missing = exports.filter((name) => !new RegExp(`export function ${name}\\b`).test(source));
  log("canon: three/coordinates.ts still owns the transform it is the home of",
    missing.length === 0 && /\(GRID_SIZE - 1\) \/ 2/.test(source),
    missing.length ? `missing: ${missing.join(", ")}` : `${exports.length} transforms exported`);
}

// --- CC-03: the L-shape truth fixture — box-vs-shape made measurable --------
// Fixture (ci/make-l-scene.mjs): 12x8 rect minus a 6x4 bite at the max-x/max-z
// corner, floor {x16..27,z16..19} ∪ {x16..21,z20..23} (72 cells), one door per
// leg. The perimeter is HAND-COMPUTED below as the six edge segments — walls
// must sit on exactly these cells (CANON-LEDGER ruling 2: walls from the
// flood-filled floor, never the box). DRIFT PIN: the reducer stamp_shell_walls
// (spacetime/src/lib.rs) today stamps the BOX hull for this fixture — walls
// across the bite mouth at z=23,x22..27 and down the bite at x=27,z20..23,
// on cells that are not even floor. CC-05 rewires it to this law; these pins
// are the measure.
{
  const { lFloorCells, L_OPENINGS } = await import("./make-l-scene.mjs");
  const floor = lFloorCells().map(({ x, z }) => ({ x, y: 0, z }));
  const key = (c) => `${c.x}_${c.z}`;

  // hand-computed perimeter: the six edge segments of the L (35 distinct cells)
  const expected = new Set();
  for (let x = 16; x <= 27; x++) expected.add(`${x}_16`); // south edge (full width)
  for (let x = 16; x <= 21; x++) expected.add(`${x}_23`); // north edge of the vertical leg
  for (let z = 16; z <= 23; z++) expected.add(`16_${z}`); // west edge (full depth)
  for (let z = 16; z <= 19; z++) expected.add(`27_${z}`); // east edge of the horizontal leg
  for (let z = 20; z <= 23; z++) expected.add(`21_${z}`); // east edge of the vertical leg (faces the bite)
  for (let x = 22; x <= 27; x++) expected.add(`${x}_19`); // bite mouth (north edge under the bite)

  const lShape = computeSpaceShape(floor);
  const lPerim = new Set(
    lShape.clusters.length === 1
      ? (await import("../space-shape.ts")).perimeterCells(lShape.clusters[0]).map(key)
      : [],
  );
  const perimEqual = lPerim.size === expected.size && [...expected].every((k) => lPerim.has(k));
  log("L-fixture: perimeterCells follow the notch — exact hand-computed set",
    expected.size === 35 && perimEqual, `expected=${expected.size} got=${lPerim.size}`);

  // walls: rise on exactly the perimeter columns minus the two door cut columns
  const doorCols = new Set(["18_16", "19_16", "16_20", "16_21"]); // door:0 + door:1 cells
  const walls = synthesizeShellWalls(floor, 2, L_OPENINGS);
  const wallCols = new Set(walls.map(key));
  const expectedCols = new Set([...expected].filter((k) => !doorCols.has(k)));
  const colsEqual = wallCols.size === expectedCols.size && [...expectedCols].every((k) => wallCols.has(k));
  const heightsOk = walls.every((w) => w.y === 1 || w.y === 2) && walls.length === expectedCols.size * 2;
  log("L-fixture: walls rise on exactly the perimeter, openings cut",
    colsEqual && heightsOk, `${wallCols.size} wall columns x2 layers (${doorCols.size} door columns cut)`);

  // drift pin: the BOX hull cells the reducer would stamp today must be wall-free
  const boxOnly = [];
  for (let x = 22; x <= 27; x++) boxOnly.push(`${x}_23`);      // across the bite mouth
  for (let z = 20; z <= 22; z++) boxOnly.push(`27_${z}`);      // down the bite's east side
  log("L-fixture: no wall on box-hull cells outside the floor (the stamp_shell_walls drift)",
    boxOnly.every((k) => !wallCols.has(k)), `${boxOnly.length} box-only cells wall-free`);

  // walkability: floor+walls => hand-computed closed form over the whole grid:
  // 0 outside the L (incl. the bite interior), 3 on wall columns (floor y0 +
  // wall y1..2 => lowest standable y=3), 1 on floor incl. door cells (the cut
  // keeps the floor standable — wallTop 2 with height-2 doors leaves no lintel).
  const floorKeys = new Set(floor.map(key));
  const lHeights = walkableHeights(floor.concat(walls), 64);
  let gridMismatch = null;
  for (let z = 0; z < 64 && !gridMismatch; z++) {
    for (let x = 0; x < 64; x++) {
      const k = `${x}_${z}`;
      const want = !floorKeys.has(k) ? 0 : wallCols.has(k) ? 3 : 1;
      if (lHeights[z * 64 + x] !== want) { gridMismatch = `${k}: got ${lHeights[z * 64 + x]} want ${want}`; break; }
    }
  }
  const notchPins = lHeights[21 * 64 + 23] === 0  // bite interior: void
    && lHeights[19 * 64 + 22] === 3               // bite-mouth wall column
    && lHeights[20 * 64 + 21] === 3               // bite-side wall column
    && lHeights[19 * 64 + 21] === 1               // reentrant-corner floor stays walkable
    && lHeights[16 * 64 + 18] === 1;              // door:0 cell keeps the floor
  log("L-fixture: walkableHeights match the hand-computed grid (notch corners pinned)",
    !gridMismatch && notchPins, gridMismatch ?? "4096 cells match; bite void, walls 3, doors 1");
}

// ── shell view = bounding box (SPEC §7.1 / Python Space._optimize) ──────────
{
  // L footprint: floor at y=0 plus a 2-high column at the corner → box grows in Y
  const L = [];
  for (let x = 0; x < 4; x++) for (let z = 0; z < 6; z++) if (!(x >= 2 && z >= 3)) L.push({ x, y: 0, z });
  L.push({ x: 0, y: 1, z: 0 }, { x: 0, y: 2, z: 0 });
  const box = shellViewBox(L);
  const sz = boxSize(box);
  log("shellView: bounding box is min/max over voxels (SPEC §7.1)",
    box.minX === 0 && box.maxX === 3 && box.minZ === 0 && box.maxZ === 5
      && box.minY === 0 && box.maxY === 2,
    JSON.stringify(box));
  log("shellView: boxSize is inclusive cell counts",
    sz.w === 4 && sz.d === 6 && sz.h === 3, JSON.stringify(sz));
  // empty → null (no invented box)
  log("shellView: empty blocks → null box",
    boundingBoxFromBlocks([]) === null, "");
  // translation: box tracks the voxels, not a fixed origin
  const shifted = L.map((b) => ({ x: b.x + 10, y: b.y, z: b.z + 20 }));
  const box2 = shellViewBox(shifted);
  log("shellView: box translates with voxels",
    box2.minX === 10 && box2.maxX === 13 && box2.minZ === 20 && box2.maxZ === 25,
    JSON.stringify(box2));
}

const fails = results.filter((ok) => !ok).length;
console.log(`\n${results.length - fails}/${results.length} engine checks pass`);
process.exit(fails ? 1 : 0);
