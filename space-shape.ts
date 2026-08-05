/**
 * NESWUD shape bridge — blocks → handshake graph → shape truth.
 *
 * The NESWUD system IS the shape representation: every block is a node with 6
 * handshakes (N/E/S/W/U/D). A space is a cluster in the handshake graph; a
 * MISSING handshake is an exposed face (no N neighbor → north wall, no U →
 * ceiling, no D → floor). Doors/windows are deliberately broken handshakes.
 * Nothing downstream should reason from a bounding box — the box is only a
 * subscription/spatial index. Every seam (editor shell, validation gate,
 * world-client dollhouse, spawn placement, CLI) consumes THIS.
 *
 * Bridged the same way space-gate bridges the ValidationEngine: pure function
 * over the engine's own BlockNodeGraph (autoLinkBlock = the handshake pass,
 * findConnectedComponents = cluster detection). Browser-safe, no side effects.
 *
 * Axis note (same as space-gate): network-lab "up" is Y; the engine's "up" is
 * Z. We map nl(x, y, z) -> engine(x, z, y). Directions are returned in
 * network-lab terms: N=+z, S=-z, E=+x, W=-x, U=+y, D=-y.
 */
import { createBlockNode } from "./core/schemas";
import { sha256Hex } from "./sha256";
import { NeighborDir, ALL_NEIGHBOR_DIRS } from "./core/constants";
import { BlockNodeGraph } from "./core/block-node";
import { findPath as findGridPath } from "./core/pathfinder";

export type ShapeDir = "N" | "E" | "S" | "W" | "U" | "D";

export interface ShapeBlock {
  x: number;
  y: number; // network-lab up-axis
  z: number;
  type?: number;
}

/** An exposed face: the block at (x,y,z) has no handshake in `dir`. */
export interface BoundaryFace {
  x: number;
  y: number;
  z: number;
  dir: ShapeDir;
}

/** Canonical 2D-Net shape identity (translation + 90°-rotation invariant). */
export interface NetFingerprint {
  /** `net1:<cells>c:<w>x<h>x<d>:<fnv1a64>` — stable mint/validation identity */
  id: string;
  cells: number;
  dims: { w: number; h: number; d: number };
}

/** One connected component in the handshake graph. */
export interface ShapeCluster {
  blocks: ShapeBlock[];
  boundaryFaces: BoundaryFace[];
  /** Walkable floor tiles: base-layer blocks whose U handshake is missing
   *  (nothing stacked on them — their top surface is exposed). */
  floorCells: { x: number; y: number; z: number }[];
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  fingerprint: NetFingerprint;
}

export interface SpaceShape {
  blocks: ShapeBlock[];
  clusters: ShapeCluster[];
  /** All exposed faces across all clusters (cluster order preserved). */
  boundaryFaces: BoundaryFace[];
}

/** Engine direction -> network-lab direction (engine y=depth is nl z; engine z=up is nl y). */
const ENGINE_TO_NL: Record<NeighborDir, ShapeDir> = {
  [NeighborDir.N]: "N",
  [NeighborDir.S]: "S",
  [NeighborDir.E]: "E",
  [NeighborDir.W]: "W",
  [NeighborDir.Up]: "U",
  [NeighborDir.Down]: "D",
};

/** Unit offsets per direction in network-lab coords. */
export const DIR_OFFSET: Record<ShapeDir, { x: number; y: number; z: number }> = {
  N: { x: 0, y: 0, z: 1 },
  S: { x: 0, y: 0, z: -1 },
  E: { x: 1, y: 0, z: 0 },
  W: { x: -1, y: 0, z: 0 },
  U: { x: 0, y: 1, z: 0 },
  D: { x: 0, y: -1, z: 0 },
};

export const OPPOSITE: Record<ShapeDir, ShapeDir> = { N: "S", S: "N", E: "W", W: "E", U: "D", D: "U" };

/**
 * Build the handshake graph from raw blocks and derive the shape truth:
 * clusters (connected components), boundary faces (missing handshakes) and
 * per-cluster walkable floor + canonical fingerprint.
 */
export function computeSpaceShape(blocks: ShapeBlock[]): SpaceShape {
  const graph = new BlockNodeGraph();
  const idFor = (b: { x: number; y: number; z: number }) => `b_${b.x}_${b.y}_${b.z}`;

  // dedupe (payloads may repeat cells), then graph + handshake pass
  const seen = new Map<string, ShapeBlock>();
  for (const b of blocks) if (!seen.has(idFor(b))) seen.set(idFor(b), b);
  const unique = Array.from(seen.values());

  for (const b of unique) {
    // nl (x, up=y, z) -> engine (x, y=depth, z=up)
    graph.addBlock(createBlockNode(idFor(b), "shape", { x: b.x, y: b.z, z: b.y }));
  }
  for (const b of unique) graph.autoLinkBlock(idFor(b));

  const clusters: ShapeCluster[] = [];

  for (const component of graph.findConnectedComponents()) {
    const clusterBlocks: ShapeBlock[] = [];
    const boundaryFaces: BoundaryFace[] = [];

    for (const blockId of component) {
      const node = graph.getBlock(blockId)!;
      const nl = seen.get(blockId)!;
      clusterBlocks.push(nl);
      for (const dir of ALL_NEIGHBOR_DIRS) {
        if (!node.neighbors[dir]) {
          boundaryFaces.push({ x: nl.x, y: nl.y, z: nl.z, dir: ENGINE_TO_NL[dir] });
        }
      }
    }

    const bounds = boundsOf(clusterBlocks);
    const floorCells = boundaryFaces
      .filter((f) => f.dir === "U" && f.y === bounds.minY)
      .map((f) => ({ x: f.x, y: f.y, z: f.z }));

    clusters.push({
      blocks: clusterBlocks,
      boundaryFaces,
      floorCells,
      bounds,
      fingerprint: netFingerprint(clusterBlocks),
    });
  }

  return {
    blocks: unique,
    clusters,
    boundaryFaces: clusters.flatMap((c) => c.boundaryFaces),
  };
}

/**
 * Canonical 2D-Net fingerprint: the shape's identity independent of where it
 * sits in the zone and which way it faces. Cells are normalized to the origin,
 * the lexicographically-least serialization over the 4 horizontal rotations is
 * taken (mirrors are NOT folded — a mirrored floor plan is a distinct shape),
 * and hashed (FNV-1a 64). Used for validation dedupe and the on-chain mint id.
 */
export function netFingerprint(blocks: ShapeBlock[]): NetFingerprint {
  if (!blocks.length) return { id: "net1:0c:0x0x0:0", cells: 0, dims: { w: 0, h: 0, d: 0 } };

  let cells = blocks.map((b) => ({ x: b.x, y: b.y, z: b.z }));
  let canonical: string | null = null;

  for (let rot = 0; rot < 4; rot++) {
    const norm = normalize(cells);
    const ser = norm
      .map((c) => `${c.x},${c.y},${c.z}`)
      .sort()
      .join(";");
    if (canonical === null || ser < canonical) canonical = ser;
    cells = cells.map((c) => ({ x: c.z, y: c.y, z: -c.x })); // 90° about the up axis
  }

  const b = boundsOf(blocks);
  const dims = { w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1, d: b.maxZ - b.minZ + 1 };
  const uniqueCells = new Set(blocks.map((c) => `${c.x},${c.y},${c.z}`)).size;
  const span = [dims.w, dims.d].sort((a, b2) => a - b2);

  return {
    id: `net1:${uniqueCells}c:${span[1]}x${dims.h}x${span[0]}:${fnv1a64(canonical!)}`,
    cells: uniqueCells,
    dims,
  };
}

/**
 * THE binary string (CANON-LEDGER § Surfaces, cuts, and the binary string):
 * the NESWUD handshake bits per block, serialized EXACTLY as the oracle's
 * `Zone.generate_fingerprint_hash` does — this is the persisted truth every
 * view projects from, and its SHA-256 is the space's fingerprint.
 *
 * Mapping (engine → oracle 5-tuple): (rx=0, ry=0, cx=x, cy=z, cz=y) — the
 * engine's up axis is `y`, the oracle's is `cz`; single-region spaces hash
 * with region (0,0). Dedupe (dict semantics), numeric tuple sort, letters
 * appended in the oracle's order: E(cx+1) W(cx−1) N(cy+1) S(cy−1) U(cz+1)
 * D(cz−1), format `rx_ry_cx_cy_cz:letters|`. Distinct from `netFingerprint`
 * (the invariant dedupe id): the binary string is POSITION-ABSOLUTE — move
 * one block and the hash cascades; that tamper-evidence is the point.
 */
export function handshakeStream(blocks: ShapeBlock[]): string {
  const seen = new Set<string>();
  const cells: [number, number, number, number, number][] = [];
  for (const b of blocks) {
    const key = `${b.x},${b.z},${b.y}`; // cx,cy,cz
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push([0, 0, b.x, b.z, b.y]);
  }
  cells.sort((a, b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2] || a[3]-b[3] || a[4]-b[4]);
  let stream = "";
  for (const [rx, ry, cx, cy, cz] of cells) {
    let letters = "";
    if (seen.has(`${cx + 1},${cy},${cz}`)) letters += "E";
    if (seen.has(`${cx - 1},${cy},${cz}`)) letters += "W";
    if (seen.has(`${cx},${cy + 1},${cz}`)) letters += "N";
    if (seen.has(`${cx},${cy - 1},${cz}`)) letters += "S";
    if (seen.has(`${cx},${cy},${cz + 1}`)) letters += "U";
    if (seen.has(`${cx},${cy},${cz - 1}`)) letters += "D";
    stream += `${rx}_${ry}_${cx}_${cy}_${cz}:${letters}|`;
  }
  return stream;
}

/**
 * The space's fingerprint: sha256(meta + handshakeStream), the oracle's
 * exact final step. `meta` mirrors the oracle's `{id}-{is_published}-{regions}-`
 * — for a published single-region space: `<spaceId>-True-[]-` (Python's str()
 * of True and the empty list, byte for byte).
 */
export function handshakeFingerprint(blocks: ShapeBlock[], meta: string): string {
  return sha256Hex(meta + handshakeStream(blocks));
}

/** The reducer's save-time meta for a published, single-region space. */
export const spaceFingerprintMeta = (spaceId: string) => `${spaceId}-True-[]-`;

/**
 * Sparse, deterministic surface overlay for the saved Space identity.
 *
 * The base handshake hash commits the reciprocal solid graph. Only authored
 * deviations from the default Wall surface need additional bytes: exact face
 * address, type, vertical span, and DoorLink target. This keeps Door/Window
 * semantics out of voxel occupancy while making their difference tamper-
 * evident. The target is length-prefixed so arbitrary ids cannot make the
 * stream ambiguous.
 */
export function typedSurfaceStream(interfaces: AuthoredInterface[]): string {
  const validTypes = new Set(["Wall", "Window", "Door", "DoorLink", "Stair", "Portal", "ActionTile", "Utility"]);
  const entries = interfaces.map((i) => {
    if (!NET_DIR_ORDER.includes(i.dir)) throw new Error(`Invalid interface direction: ${String(i.dir)}`);
    if (!validTypes.has(i.type)) throw new Error(`Invalid interface type: ${String(i.type)}`);
    const span = interfaceSpan(i);
    const target = i.type === "DoorLink"
      ? String(i.params?.["targetSpaceId"] ?? "")
      : "";
    const entry = {
      x: i.x, y: i.y, z: i.z, dir: i.dir, type: i.type,
      fromY: Number(span[0]), height: Number(span[1]), target,
    };
    if (![entry.x, entry.y, entry.z, entry.fromY, entry.height].every(Number.isSafeInteger)) {
      throw new Error("Interface coordinates and span must be safe integers");
    }
    if (entry.height <= 0) throw new Error("Interface height must be positive");
    if (entry.type === "DoorLink" && entry.target.length === 0) throw new Error("DoorLink requires targetSpaceId");
    return entry;
  });
  const utf8 = new TextEncoder();
  const compareUtf8 = (a: string, b: string): number => {
    const aa = utf8.encode(a), bb = utf8.encode(b), n = Math.min(aa.length, bb.length);
    for (let i = 0; i < n; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return aa.length - bb.length;
  };
  entries.sort((a, b) =>
    a.x - b.x || a.y - b.y || a.z - b.z ||
    NET_DIR_ORDER.indexOf(a.dir) - NET_DIR_ORDER.indexOf(b.dir) ||
    compareUtf8(a.type, b.type) || a.fromY - b.fromY ||
    a.height - b.height || compareUtf8(a.target, b.target));
  return entries.map((i) =>
    `${i.x},${i.y},${i.z},${i.dir},${i.type},${i.fromY},${i.height},${new TextEncoder().encode(i.target).length}:${i.target}|`,
  ).join("");
}

/**
 * Versioned saved identity: the oracle-pinned topology hash plus the sparse
 * typed-surface overlay. `handshakeFingerprint` remains the independently
 * testable M8 base; the prefix prevents old raw hashes being silently
 * reinterpreted after a resave.
 */
export function spaceSurfaceFingerprint(
  blocks: ShapeBlock[],
  meta: string,
  interfaces: AuthoredInterface[] = [],
): string {
  const base = handshakeFingerprint(blocks, meta);
  const payload = `NESWUD_SURFACE_V2|${base}|${typedSurfaceStream(interfaces)}`;
  return `neswud2:${sha256Hex(payload)}`;
}

// ---------------------------------------------------------------- bitmask train wire

/**
 * NT1 is the original “train upward” idea made unambiguous.
 *
 * Consecutive layers with the same exact footprint are one run. Each run stores
 * that 2D floor shape once, its repetition count, and 9-bit cell tokens:
 * N/E/S/W, presence, two-bit Up outcome, two-bit Down outcome. Up/Down describe
 * how the run attaches to the adjacent run (0=connected, 1=hollow, 2=object
 * boundary); continuation inside a repeated run is implicit. A plane may have
 * several horizontal islands, so each island gets its own BFS origin. The full
 * Space must still be one reciprocal 3D component.
 *
 * Storage therefore scales with distinct floor/interface shapes rather than
 * blindly with volume: a 64×64×100 tower stores one footprint + repeat=100.
 */
const NET_MAGIC = [0x4e, 0x54, 0x31] as const; // "NT1"
const NET_HEADER_BYTES = 7; // magic + i16 minimum y + u16 run count
const NET_RUN_HEADER_BYTES = 4; // u16 repeat + u16 horizontal component count
const NET_COMPONENT_HEADER_BYTES = 8; // i16 origin x/z + u32 token count
const NET_FLOOR = 1 << 4;
const NET_MAX_EXPANDED_CELLS = 1_000_000;
const NET_HORIZONTAL: Record<"N" | "E" | "S" | "W", number> = {
  N: 1 << 0, E: 1 << 1, S: 1 << 2, W: 1 << 3,
};
const NET_DIR_ORDER: ShapeDir[] = ["N", "E", "S", "W", "U", "D"];
const NET_HORIZONTAL_ORDER = ["N", "E", "S", "W"] as const;
type NetComponent = { origin: { x: number; z: number }; words: number[] };
type NetRun = { repeat: number; components: NetComponent[]; cells: Set<string> };

function tokenConnects(word: number, dir: ShapeDir): boolean {
  if (dir === "U") return ((word >> 5) & 0b11) === 0;
  if (dir === "D") return ((word >> 7) & 0b11) === 0;
  return (word & NET_HORIZONTAL[dir]) !== 0;
}

function packedWords(words: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(words.length * 9 / 8));
  for (let i = 0; i < words.length; i++) for (let bit = 0; bit < 9; bit++) {
    if ((words[i] & (1 << bit)) === 0) continue;
    const packed = i * 9 + bit;
    out[Math.floor(packed / 8)] |= 1 << (packed % 8);
  }
  return out;
}

function unpackedWords(bytes: Uint8Array, count: number): number[] {
  const words: number[] = [];
  for (let i = 0; i < count; i++) {
    let word = 0;
    for (let bit = 0; bit < 9; bit++) {
      const packed = i * 9 + bit;
      if (bytes[Math.floor(packed / 8)] & (1 << (packed % 8))) word |= 1 << bit;
    }
    if ((word & NET_FLOOR) === 0) throw new Error(`NESWUD token ${i} has no cell-presence bit`);
    if (((word >> 5) & 0b11) === 3 || ((word >> 7) & 0b11) === 3) {
      throw new Error(`NESWUD token ${i} uses a reserved vertical state`);
    }
    words.push(word);
  }
  return words;
}

function footprintKey(blocks: ShapeBlock[]): string {
  return blocks.map((b) => `${b.x},${b.z}`).sort().join("|");
}

/** Encode one connected Space as a bottom-up packed NESWUD train. */
export function encodeNeswudBitmask(blocks: ShapeBlock[]): Uint8Array {
  const shape = computeSpaceShape(blocks);
  if (shape.clusters.length > 1) throw new Error(`NESWUD bitmask requires one connected Space; got ${shape.clusters.length}`);
  const unique = shape.blocks;
  if (unique.some((b) => !Number.isInteger(b.x) || !Number.isInteger(b.y) || !Number.isInteger(b.z))) {
    throw new Error("NESWUD bitmask coordinates must be integers");
  }
  if (unique.some((b) => b.x < -32768 || b.x > 32767 || b.y < -32768 || b.y > 32767 || b.z < -32768 || b.z > 32767)) {
    throw new Error("NESWUD bitmask coordinates exceed signed 16-bit range");
  }
  if (unique.length === 0) {
    const empty = new Uint8Array(NET_HEADER_BYTES); empty.set(NET_MAGIC);
    return empty;
  }

  const byY = new Map<number, ShapeBlock[]>();
  for (const b of unique) { const layer = byY.get(b.y) ?? []; layer.push(b); byY.set(b.y, layer); }
  const ys = [...byY.keys()].sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) if (ys[i] !== ys[i - 1] + 1) {
    throw new Error(`NESWUD train has an empty layer between y=${ys[i - 1]} and y=${ys[i]}`);
  }

  const groups: { repeat: number; layer: ShapeBlock[] }[] = [];
  for (const y of ys) {
    const layer = byY.get(y)!;
    const previous = groups[groups.length - 1];
    if (previous && footprintKey(previous.layer) === footprintKey(layer)) previous.repeat++;
    else groups.push({ repeat: 1, layer });
  }

  const runs: NetRun[] = groups.map((g, runIndex) => {
    const cells = new Set(g.layer.map((b) => `${b.x}_${b.z}`));
    const below = runIndex > 0 ? new Set(groups[runIndex - 1].layer.map((b) => `${b.x}_${b.z}`)) : null;
    const above = runIndex + 1 < groups.length ? new Set(groups[runIndex + 1].layer.map((b) => `${b.x}_${b.z}`)) : null;
    const clusters = computeSpaceShape(g.layer.map((b) => ({ x: b.x, y: 0, z: b.z }))).clusters
      .sort((a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minZ - b.bounds.minZ);
    const components = clusters.map((cluster) => {
      const componentCells = new Set(cluster.blocks.map((b) => `${b.x}_${b.z}`));
      const origin = [...cluster.blocks].sort((a, b) => a.x - b.x || a.z - b.z)[0];
      const queue = [{ x: origin.x, z: origin.z }];
      const enqueued = new Set([`${origin.x}_${origin.z}`]);
      const words: number[] = [];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const cell = queue[cursor];
        let word = NET_FLOOR;
        for (const dir of NET_HORIZONTAL_ORDER) {
          const d = DIR_OFFSET[dir];
          if (componentCells.has(`${cell.x + d.x}_${cell.z + d.z}`)) word |= NET_HORIZONTAL[dir];
        }
        const key = `${cell.x}_${cell.z}`;
        word |= (above ? (above.has(key) ? 0 : 1) : 2) << 5;
        word |= (below ? (below.has(key) ? 0 : 1) : 2) << 7;
        words.push(word);
        for (const dir of NET_HORIZONTAL_ORDER) {
          if (!tokenConnects(word, dir)) continue;
          const d = DIR_OFFSET[dir]; const next = { x: cell.x + d.x, z: cell.z + d.z };
          const nextKey = `${next.x}_${next.z}`;
          if (!enqueued.has(nextKey)) { enqueued.add(nextKey); queue.push(next); }
        }
      }
      if (words.length !== cluster.blocks.length) throw new Error("NESWUD train failed to encode a horizontal component");
      return { origin: { x: origin.x, z: origin.z }, words };
    });
    return { repeat: g.repeat, components, cells };
  });

  if (runs.length > 65535 || runs.some((r) => r.repeat > 65535 || r.components.length > 65535)) {
    throw new Error("NESWUD train exceeds 16-bit run limits");
  }
  const size = NET_HEADER_BYTES + runs.reduce((sum, run) => sum + NET_RUN_HEADER_BYTES +
    run.components.reduce((n, c) => n + NET_COMPONENT_HEADER_BYTES + Math.ceil(c.words.length * 9 / 8), 0), 0);
  const out = new Uint8Array(size); out.set(NET_MAGIC);
  const view = new DataView(out.buffer); view.setInt16(3, ys[0], true); view.setUint16(5, runs.length, true);
  let offset = NET_HEADER_BYTES;
  for (const run of runs) {
    view.setUint16(offset, run.repeat, true); view.setUint16(offset + 2, run.components.length, true); offset += NET_RUN_HEADER_BYTES;
    for (const component of run.components) {
      view.setInt16(offset, component.origin.x, true); view.setInt16(offset + 2, component.origin.z, true);
      view.setUint32(offset + 4, component.words.length, true); offset += NET_COMPONENT_HEADER_BYTES;
      const packed = packedWords(component.words); out.set(packed, offset); offset += packed.length;
    }
  }
  return out;
}

/** Decode, expand, and reciprocal-validate a bottom-up NESWUD train. */
export function decodeNeswudBitmask(bytes: Uint8Array): ShapeBlock[] {
  if (bytes.length < NET_HEADER_BYTES || NET_MAGIC.some((b, i) => bytes[i] !== b)) throw new Error("Invalid NESWUD train header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minY = view.getInt16(3, true), runCount = view.getUint16(5, true);
  let offset = NET_HEADER_BYTES;
  const runs: NetRun[] = [];
  let expandedCells = 0;
  let expandedLayers = 0;
  for (let r = 0; r < runCount; r++) {
    if (offset + NET_RUN_HEADER_BYTES > bytes.length) throw new Error("Truncated NESWUD run header");
    const repeat = view.getUint16(offset, true), componentCount = view.getUint16(offset + 2, true); offset += NET_RUN_HEADER_BYTES;
    if (repeat === 0 || componentCount === 0) throw new Error(`Invalid NESWUD run ${r}`);
    expandedLayers += repeat;
    if (minY + expandedLayers - 1 > 32767) throw new Error("NESWUD train exceeds signed 16-bit y range");
    const components: NetComponent[] = [], cells = new Set<string>(), runWords = new Map<string, number>();
    for (let c = 0; c < componentCount; c++) {
      if (offset + NET_COMPONENT_HEADER_BYTES > bytes.length) throw new Error("Truncated NESWUD component header");
      const origin = { x: view.getInt16(offset, true), z: view.getInt16(offset + 2, true) };
      const count = view.getUint32(offset + 4, true); offset += NET_COMPONENT_HEADER_BYTES;
      if (count > NET_MAX_EXPANDED_CELLS) throw new Error("NESWUD component exceeds decoded-cell limit");
      expandedCells += count * repeat;
      if (expandedCells > NET_MAX_EXPANDED_CELLS) throw new Error("NESWUD train exceeds decoded-cell limit");
      const packedLength = Math.ceil(count * 9 / 8);
      if (count === 0 || offset + packedLength > bytes.length) throw new Error("Truncated NESWUD component tokens");
      const words = unpackedWords(bytes.subarray(offset, offset + packedLength), count); offset += packedLength;
      const queue = [origin], wordByKey = new Map<string, number>();
      const enqueued = new Set([`${origin.x}_${origin.z}`]);
      for (let i = 0; i < words.length; i++) {
        const cell = queue[i]; if (!cell) throw new Error(`NESWUD component ${c} has unreachable tokens`);
        if (cell.x < -32768 || cell.x > 32767 || cell.z < -32768 || cell.z > 32767) {
          throw new Error("NESWUD component traversal exceeds signed 16-bit coordinate range");
        }
        const key = `${cell.x}_${cell.z}`;
        if (cells.has(key)) throw new Error(`NESWUD run ${r} repeats cell ${key}`);
        cells.add(key); wordByKey.set(key, words[i]); runWords.set(key, words[i]);
        for (const dir of NET_HORIZONTAL_ORDER) {
          if (!tokenConnects(words[i], dir)) continue;
          const d = DIR_OFFSET[dir], next = { x: cell.x + d.x, z: cell.z + d.z }, nextKey = `${next.x}_${next.z}`;
          if (!enqueued.has(nextKey)) { enqueued.add(nextKey); queue.push(next); }
        }
      }
      if (queue.length !== count) throw new Error(`NESWUD component ${c} declares ${queue.length} cells but has ${count} tokens`);
      for (const [key, word] of wordByKey) {
        const [x, z] = key.split("_").map(Number);
        for (const dir of NET_HORIZONTAL_ORDER) {
          const d = DIR_OFFSET[dir], neighbor = wordByKey.get(`${x + d.x}_${z + d.z}`), connected = tokenConnects(word, dir);
          if (connected && neighbor === undefined) throw new Error(`Dangling ${dir} connector at ${x},${z}`);
          if (neighbor !== undefined && (!connected || !tokenConnects(neighbor, OPPOSITE[dir]))) {
            throw new Error(`Non-reciprocal ${dir}/${OPPOSITE[dir]} handshake at ${x},${z}`);
          }
        }
      }
      components.push({ origin, words });
    }
    for (const [key, word] of runWords) {
      const [x, z] = key.split("_").map(Number);
      for (const dir of NET_HORIZONTAL_ORDER) {
        const d = DIR_OFFSET[dir], neighbor = runWords.get(`${x + d.x}_${z + d.z}`), connected = tokenConnects(word, dir);
        if (neighbor !== undefined && (!connected || !tokenConnects(neighbor, OPPOSITE[dir]))) {
          throw new Error(`Non-reciprocal cross-component ${dir}/${OPPOSITE[dir]} handshake at ${x},${z}`);
        }
      }
    }
    runs.push({ repeat, components, cells });
  }
  if (offset !== bytes.length) throw new Error(`NESWUD train has ${bytes.length - offset} trailing bytes`);
  if (runCount === 0) return [];

  const blocks: ShapeBlock[] = []; let y = minY;
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r], below = r > 0 ? runs[r - 1].cells : null, above = r + 1 < runs.length ? runs[r + 1].cells : null;
    for (const component of run.components) {
      const queue = [component.origin], enqueued = new Set([`${component.origin.x}_${component.origin.z}`]);
      for (let i = 0; i < component.words.length; i++) {
        const cell = queue[i], word = component.words[i], key = `${cell.x}_${cell.z}`;
        const expectedUp = above ? (above.has(key) ? 0 : 1) : 2;
        const expectedDown = below ? (below.has(key) ? 0 : 1) : 2;
        if (((word >> 5) & 0b11) !== expectedUp || ((word >> 7) & 0b11) !== expectedDown) {
          throw new Error(`Invalid vertical attachment state at run ${r} cell ${key}`);
        }
        for (let dy = 0; dy < run.repeat; dy++) blocks.push({ x: cell.x, y: y + dy, z: cell.z });
        for (const dir of NET_HORIZONTAL_ORDER) if (tokenConnects(word, dir)) {
          const d = DIR_OFFSET[dir], next = { x: cell.x + d.x, z: cell.z + d.z }, nextKey = `${next.x}_${next.z}`;
          if (!enqueued.has(nextKey)) { enqueued.add(nextKey); queue.push(next); }
        }
      }
    }
    y += run.repeat;
  }
  if (computeSpaceShape(blocks).clusters.length !== 1) throw new Error("NESWUD train does not reconstruct one connected Space");
  return blocks;
}

/**
 * Dollhouse direction filter: which face directions to hide so the camera
 * looks INTO the space — always U (the ceiling) plus the two horizontal
 * directions facing the camera. D (the floor) stays visible; whether the
 * consumer also drops D (the editor does — its voxel floor shows instead)
 * is a per-seam choice.
 *
 * COARSE, and superseded for the dollhouse itself: this hides a WHOLE
 * direction, which on a concave footprint (L / U / courtyard) also removes
 * far-side walls that face the camera's quadrant but are not between the
 * camera and the interior. `dollhouseVisibleFaces` below is the current
 * per-face law (owner ruling, this session; viz/docs/ARCHITECTURE.md
 * "Dollhouse cutaway (current, owner-driven)", 2026-07-22). This function
 * stays because the space-editor shell and the direction leg of
 * ci/dollhouse-matrix.mjs consume it; its behaviour is pinned and unchanged.
 */
export function dollhouseHiddenDirs(
  camera: { x: number; z: number },
  center: { x: number; z: number },
): Set<ShapeDir> {
  const hidden = new Set<ShapeDir>(["U"]);
  const dx = camera.x - center.x;
  const dz = camera.z - center.z;
  if (dx > 0) hidden.add("E");
  if (dx < 0) hidden.add("W");
  if (dz > 0) hidden.add("N");
  if (dz < 0) hidden.add("S");
  return hidden;
}

// ------------------------------------------------ dollhouse per-face cutaway
//
// THE PER-FACE CUTAWAY, ported whole from the viz's settled implementation
// (`../../viz/live/hubzz_render_pipeline.py`: `_face_hidden`, the `if hidden:`
// block of `build_space_scene`, `_face_edges`, `_surfaces_of`). Nothing here is
// invented; ci/dollhouse-matrix.mjs leg M-D6 execs that Python and requires the
// two to return the identical face set, so a viz edit breaks this port.
//
// AXIS MAP (viz is z-up, this engine is y-up). Established from
// `viz/live/tower_halls_core.py:engine_blocks/engine_payload` and
// `viz/docs/CANON-PARITY.md`:
//
//   viz solid `v = (x, footprint_y, layer)`  ->  block `{x, y: layer, z: footprint_y}`
//   i.e. a viz triple (a, b, c) is the engine triple (a, c, b) — components 1
//   and 2 swap, component 0 is shared. The swap is a bijection on vertices, so
//   quads, edges and seam topology carry over unchanged.
//
//   viz px (+x) = E     viz nx (-x) = W
//   viz py (+y) = N     viz ny (-y) = S      (viz footprint y IS engine z)
//   viz pz (+z) = U     viz nz (-z) = D      (viz layer z IS engine y)
//
//   viz `cam_xy` = (viz x, viz footprint y) = the engine's `{x, z}` camera.
//   viz `v[2]` (the layer, used by the support rule) = the engine's `y`.
//
// Coordinates are CELL-CORNER, exactly as the oracle's `face_vertices` is: the
// block at (x, y, z) occupies [x,x+1] x [y,y+1] x [z,z+1], so its centre is
// (x+0.5, y+0.5, z+0.5). A renderer whose cell coordinate names the cell CENTRE
// must add 0.5 to the camera it passes in.

/** A quad's 4 corner offsets from the block origin, per face direction — the
 *  oracle's `face_vertices` with the viz->engine axis swap applied. */
const FACE_QUAD: Record<ShapeDir, readonly (readonly [number, number, number])[]> = {
  E: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
  W: [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]],
  N: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]],
  S: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],
  U: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  D: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]],
};

type QuadVertex = readonly [number, number, number];

const faceQuad = (f: BoundaryFace): QuadVertex[] =>
  FACE_QUAD[f.dir].map(([dx, dy, dz]) => [f.x + dx, f.y + dy, f.z + dz] as const);

const vertexKey = (v: QuadVertex) => `${v[0]}_${v[1]}_${v[2]}`;
const edgeKey = (a: QuadVertex, b: QuadVertex) => {
  const [ka, kb] = [vertexKey(a), vertexKey(b)];
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/**
 * THE seam source (the viz's `_face_edges`): per-face quads plus an
 * edge -> face-index map. One derivation feeds every dollhouse stage below —
 * FORMULAS.md "Seams". Do not re-derive seams in a consumer.
 */
function faceEdges(faces: BoundaryFace[]): {
  quads: QuadVertex[][];
  edges: Map<string, number[]>;
} {
  const quads = faces.map(faceQuad);
  const edges = new Map<string, number[]>();
  for (let i = 0; i < quads.length; i++) {
    for (let k = 0; k < 4; k++) {
      const key = edgeKey(quads[i][k], quads[i][(k + 1) % 4]);
      const at = edges.get(key);
      if (at) at.push(i);
      else edges.set(key, [i]);
    }
  }
  return { quads, edges };
}

/** Flood faces into seam-bounded surfaces over the shared seam source (the
 *  viz's `_surfaces_of`). Returns surface representative index per face. */
function surfacesOf(
  faces: BoundaryFace[],
  quads: QuadVertex[][],
  edges: Map<string, number[]>,
  sameDir = true,
): number[] {
  const surf = new Array<number>(faces.length).fill(-1);
  for (let i = 0; i < faces.length; i++) {
    if (surf[i] !== -1) continue;
    surf[i] = i;
    const frontier = [i];
    while (frontier.length) {
      const j = frontier.pop()!;
      for (let k = 0; k < 4; k++) {
        for (const m of edges.get(edgeKey(quads[j][k], quads[j][(k + 1) % 4])) ?? []) {
          if (surf[m] === -1 && (!sameDir || faces[m].dir === faces[j].dir)) {
            surf[m] = i;
            frontier.push(m);
          }
        }
      }
    }
  }
  return surf;
}

/**
 * Stage 1 of the cutaway — the per-face camera test (the viz's `_face_hidden`).
 * U is ALWAYS hidden, D is NEVER hidden, and a wall is hidden iff its outward
 * normal points back at the camera: `n · (cam − faceCentre) > 0.1`, with the
 * face centre taken in the ground plane.
 *
 * `camera` is in cell-corner units (see the axis-map note above).
 */
export function dollhouseFaceHidden(
  face: BoundaryFace,
  camera: { x: number; z: number },
): boolean {
  if (face.dir === "U") return true;
  if (face.dir === "D") return false;
  const n = DIR_OFFSET[face.dir];
  const fx = face.x + 0.5 + n.x * 0.5;
  const fz = face.z + 0.5 + n.z * 0.5;
  return n.x * (camera.x - fx) + n.z * (camera.z - fz) > 0.1;
}

/**
 * The dollhouse cutaway: which boundary faces the camera actually sees.
 *
 * Three settled stages, in order (viz/docs/ARCHITECTURE.md "Dollhouse cutaway
 * (current, owner-driven)", rules 1-4):
 *
 *   1. per-face camera test — `dollhouseFaceHidden` above;
 *   2. seam survival — flood the surviving walls into seam-bounded surfaces
 *      and keep only surfaces a seam connects to another surviving surface,
 *      iterating the fixed point that removes orphans;
 *   3. support — a staying wall above the base layer stands on something: the
 *      whole seam-bounded U surface its BASE seam lands on comes back.
 *
 * Returns the visible subset (input order, resurrected U faces appended). The
 * input should be the space's full boundary-face set (`typedBoundaryFaces` or
 * `computeSpaceShape().boundaryFaces`); extra per-face fields are preserved.
 *
 * PARKED and deliberately not decided here (CANON-LEDGER "OPEN"): whether a
 * resurrected U surface reads as roof or balcony, and capping the section cut.
 */
export function dollhouseVisibleFaces<T extends BoundaryFace>(
  faces: T[],
  camera: { x: number; z: number },
): T[] {
  // 1 — per-face camera test.
  let shell = faces.filter((f) => !dollhouseFaceHidden(f, camera));

  // 2 — a wall only stays if a seam connects it to another staying wall.
  const wallIdx: number[] = [];
  shell.forEach((f, i) => {
    if (f.dir !== "U" && f.dir !== "D") wallIdx.push(i);
  });
  const walls = wallIdx.map((i) => shell[i]);
  const { quads, edges } = faceEdges(walls);
  const surf = surfacesOf(walls, quads, edges);
  const adj = new Map<number, Set<number>>();
  for (const members of edges.values()) {
    if (new Set(members.map((i) => walls[i].dir)).size <= 1) continue;
    const touching = new Set(members.map((i) => surf[i]));
    for (const a of touching) {
      let peers = adj.get(a);
      if (!peers) adj.set(a, (peers = new Set<number>()));
      for (const b of touching) if (b !== a) peers.add(b);
    }
  }
  const alive = new Set(surf);
  for (let changed = true; changed; ) {
    changed = false;
    for (const s of [...alive]) {
      let supported = false;
      for (const peer of adj.get(s) ?? []) if (alive.has(peer)) { supported = true; break; }
      if (!supported) {
        alive.delete(s);
        changed = true;
      }
    }
  }
  const keep = new Set(wallIdx.filter((_, i) => alive.has(surf[i])));
  shell = shell.filter((f, i) => f.dir === "U" || f.dir === "D" || keep.has(i));

  // 3 — a staying wall must stand on something visible: keep the whole
  // seam-bounded U surface its base seam lands on.
  const upFaces = faces.filter((f) => f.dir === "U");
  const up = faceEdges(upFaces);
  const upSurf = surfacesOf(upFaces, up.quads, up.edges, false);
  const hit = new Set<number>();
  for (const f of shell) {
    if (f.dir === "U" || f.dir === "D" || f.y === 0) continue;
    const base = faceQuad(f).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const i of up.edges.get(edgeKey(base[0], base[1])) ?? []) hit.add(upSurf[i]);
  }
  return [...shell, ...upFaces.filter((_, i) => hit.has(upSurf[i]))];
}

/** Stable identity of a boundary face — for consumers that must test a face
 *  against the visible set `dollhouseVisibleFaces` returned. */
export function boundaryFaceKey(f: BoundaryFace): string {
  return `${f.x}_${f.y}_${f.z}_${f.dir}`;
}

/** Cells that carry at least one horizontal boundary face (the true perimeter
 *  of any footprint shape — box, L, U, courtyard alike). */
export function perimeterCells(cluster: ShapeCluster): ShapeBlock[] {
  const keys = new Set(
    cluster.boundaryFaces
      .filter((f) => f.dir !== "U" && f.dir !== "D")
      .map((f) => `${f.x}_${f.y}_${f.z}`),
  );
  return cluster.blocks.filter((b) => keys.has(`${b.x}_${b.y}_${b.z}`));
}

// ---------------------------------------------------------------- openings

/**
 * A door/window opening: a deliberately broken handshake on the outer wall.
 * `from..to` runs along the wall axis; `fromY` is shell-local (0 = the first
 * layer above the floor surface); `at` anchors the opening to the wall cells'
 * fixed coordinate so it can't bleed onto another segment facing the same
 * direction (absent on older published openings = matches any segment).
 * Doors are openings with fromY 0; windows sit above (fromY >= 1).
 *
 * DERIVED VIEW: the authored truth is the engine's InterfaceElement model
 * (`interfaces` in the scene payload — see openingsToInterfaces /
 * interfacesToOpenings). Openings remain the published projection the Rust
 * wall-stamper and collision derivation consume.
 */
export interface ShellOpening {
  side: "xMin" | "xMax" | "zMin" | "zMax";
  at?: number;
  from: number;
  to: number;
  fromY: number;
  height: number;
  /** Door destination (makes the door a DoorLink — 1-to-1 by design). */
  targetSpaceId?: string;
}

/** An authored engine interface element in network-lab axes: attached to the
 *  wall block at (x,y,z), facing `dir`. The scene payload's `interfaces` field. */
export interface AuthoredInterface {
  x: number;
  y: number; // network-lab up-axis (wall block level; floor voxel = y 0)
  z: number;
  dir: ShapeDir;
  type: string; // engine InterfaceType name (Door | DoorLink | Window | ...)
  params?: Record<string, unknown>;
}

/**
 * THE ONE span law: an authored interface's vertical extent `[fromY, height]`.
 * `params.span` when authored; otherwise the CANONICAL default the fingerprint
 * stream (`typedSurfaceStream`) has always committed — anchored at the
 * interface's own y, 1 layer for a Window, 2 for everything else (a door is
 * passable). Every reader of an interface span MUST come through here;
 * five inline re-declarations (with one disagreeing default) is how the
 * 2026-08 audit found this. Pinned by `ci/engine-checks.mjs`.
 */
export function interfaceSpan(i: AuthoredInterface): [number, number] {
  return (i.params?.["span"] as [number, number] | undefined)
    ?? [i.y, i.type === "Window" ? 1 : 2];
}

const SIDE_TO_DIR: Record<ShellOpening["side"], ShapeDir> = {
  xMax: "E", xMin: "W", zMax: "N", zMin: "S",
};
const DIR_TO_SIDE: Partial<Record<ShapeDir, ShellOpening["side"]>> = {
  E: "xMax", W: "xMin", N: "zMax", S: "zMin",
};

/**
 * Lift openings (the legacy/derived projection) into authored engine
 * interfaces: one element per wall cell, anchored to the THRESHOLD block —
 * the block under the cut (the floor under a door, the sill under a window).
 * The cut itself removes the wall voxels, so the threshold is the face the
 * interface element lives on; the vertical span is carried in
 * `params.span = [fromY, height]`. Openings without `at` cannot be anchored
 * to cells and are skipped (none have been published).
 */
export function openingsToInterfaces(openings: ShellOpening[]): AuthoredInterface[] {
  const interfaces: AuthoredInterface[] = [];
  for (const o of openings) {
    if (o.at === undefined) continue;
    const dir = SIDE_TO_DIR[o.side];
    const type = o.targetSpaceId ? "DoorLink" : o.fromY === 0 ? "Door" : "Window";
    const alongX = dir === "N" || dir === "S";
    for (let along = o.from; along <= o.to; along++) {
      interfaces.push({
        x: alongX ? along : o.at,
        y: o.fromY, // the threshold block (floor voxel = y 0, sill = wall block below the cut)
        z: alongX ? o.at : along,
        dir,
        type,
        params: {
          span: [o.fromY, o.height],
          ...(o.targetSpaceId ? { targetSpaceId: o.targetSpaceId } : {}),
        },
      });
    }
  }
  return interfaces;
}

/**
 * Project authored interfaces back to the openings view (the Rust
 * wall-stamper's contract): group per (dir, wall coordinate, type+span+target),
 * merge contiguous cells into ranged records. Inverse of openingsToInterfaces
 * — the round-trip is CI-checked.
 */
export function interfacesToOpenings(interfaces: AuthoredInterface[]): ShellOpening[] {
  type Group = {
    side: ShellOpening["side"]; at: number; target?: string;
    fromY: number; height: number; alongs: number[];
  };
  const groups = new Map<string, Group>();

  for (const i of interfaces) {
    const side = DIR_TO_SIDE[i.dir];
    if (!side) continue; // U/D interfaces have no wall-opening projection
    if (i.type !== "Door" && i.type !== "DoorLink" && i.type !== "Window") continue;
    const alongX = i.dir === "N" || i.dir === "S";
    const at = alongX ? i.z : i.x;
    const along = alongX ? i.x : i.z;
    const span = interfaceSpan(i);
    const target = i.type === "DoorLink" ? (i.params?.["targetSpaceId"] as string | undefined) : undefined;
    const key = `${i.dir}|${at}|${i.type}|${span[0]}_${span[1]}|${target ?? ""}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { side, at, target, fromY: span[0], height: span[1], alongs: [] }));
    g.alongs.push(along);
  }

  const openings: ShellOpening[] = [];
  for (const g of groups.values()) {
    const alongs = [...new Set(g.alongs)].sort((a, b) => a - b);
    let from = alongs[0];
    for (let i = 1; i <= alongs.length; i++) {
      if (i === alongs.length || alongs[i] !== alongs[i - 1] + 1) {
        openings.push({
          side: g.side, at: g.at, from, to: alongs[i - 1],
          fromY: g.fromY, height: g.height,
          ...(g.target ? { targetSpaceId: g.target } : {}),
        });
        if (i < alongs.length) from = alongs[i];
      }
    }
  }
  return openings;
}

/** Face direction -> the opening side it breaks + the axis the wall runs along. */
export const SIDE_OF_DIR: Record<"E" | "W" | "N" | "S", { side: ShellOpening["side"]; alongX: boolean }> = {
  E: { side: "xMax", alongX: false },
  W: { side: "xMin", alongX: false },
  N: { side: "zMax", alongX: true },
  S: { side: "zMin", alongX: true },
};

/** Does any opening break the handshake of the face at cell (x,z), direction
 *  `dir`, shell-local layer `ly`? */
export function openingCovers(
  openings: ShellOpening[],
  dir: ShapeDir,
  x: number,
  z: number,
  ly: number,
): boolean {
  const s = SIDE_OF_DIR[dir as "E" | "W" | "N" | "S"];
  if (!s) return false;
  const along = s.alongX ? x : z;
  const at = s.alongX ? z : x;
  return openings.some(
    (o) =>
      o.side === s.side &&
      (o.at === undefined || o.at === at) &&
      along >= o.from && along <= o.to &&
      ly >= o.fromY && ly < o.fromY + o.height,
  );
}

/**
 * Synthesize the OUTER wall blocks for a footprint: the cells with missing
 * horizontal handshakes ARE the perimeter, and walls rise on exactly those
 * cells (y = 1..wallTop above the floor surface), minus openings. One law for
 * the editor's validation gate and the CLI — and it works for any footprint
 * shape the handshake graph describes.
 */
export function synthesizeShellWalls(
  footprint: ShapeBlock[],
  wallTop: number,
  openings: ShellOpening[] = [],
): ShapeBlock[] {
  const walls: ShapeBlock[] = [];
  const shape = computeSpaceShape(footprint.map((b) => ({ x: b.x, y: 0, z: b.z })));

  for (const cluster of shape.clusters) {
    const facesAt = new Map<string, ShapeDir[]>();
    for (const f of cluster.boundaryFaces) {
      if (f.dir === "U" || f.dir === "D") continue;
      const k = `${f.x}_${f.z}`;
      const list = facesAt.get(k) ?? [];
      list.push(f.dir);
      facesAt.set(k, list);
    }

    for (const cell of perimeterCells(cluster)) {
      const dirs = facesAt.get(`${cell.x}_${cell.z}`) ?? [];
      for (let ly = 0; ly < wallTop; ly++) {
        // an opening covering ANY of this cell's exposed faces at this layer
        // breaks the wall block (the cutout passes through)
        if (dirs.some((d) => openingCovers(openings, d, cell.x, cell.z, ly))) continue;
        walls.push({ x: cell.x, y: ly + 1, z: cell.z, type: 2 });
      }
    }
  }

  return walls;
}

/**
 * One transient renderer surface at an exact NESWUD face address. This is a
 * flood-fill projection, never a persisted geometry record.
 */
export interface TypedFace {
  x: number; z: number; y: number; dir: ShapeDir;
  type: "wall" | "door" | "window";
}

/**
 * Authored surface type -> the face type the renderers key on.
 *
 * `Portal` is the TELEPORTAL TAPE's door (ruling 15: the tape is added with the
 * Structure, not authored as a unit door). The viz PoC
 * (`viz/live/tower_halls_core.py`) authors the elevator doors exactly this way
 * and displays them as it displays a Door — so a Portal is an OPENING here, not
 * a wall. It was absent from this map while being an accepted type in both the
 * engine validator and the reducer, which meant an authored Portal saved
 * cleanly and then rendered as neutral wall with no parallax and no report.
 */
const FACE_TYPE: Record<string, TypedFace["type"]> = {
  Door: "door", DoorLink: "door", Portal: "door", Window: "window",
};

/** Resolve the authored overlay at one exact boundary-face address. Consumers
 * that need DoorLink metadata use this same lookup instead of reimplementing
 * span/address matching. */
export function authoredInterfaceAtFace(
  face: BoundaryFace,
  interfaces: AuthoredInterface[],
): AuthoredInterface | undefined {
  return interfaces.find((i) => {
    if (i.x !== face.x || i.z !== face.z || i.dir !== face.dir) return false;
    if (face.dir === "U" || face.dir === "D") return i.y === face.y;
    // interfaceSpan is the ONE default. This used to read `?? [i.y, 1]`, so a
    // spanless Door typed one wall layer while the fingerprint stream committed
    // two — unified 2026-08-05 in favor of the canonical stream default (see
    // qa/INTERFACE-REMAINING.md "Open engine question", now resolved).
    const [fromY, height] = interfaceSpan(i);
    return face.y >= fromY && face.y < fromY + height;
  });
}

function typeAtBoundaryFace(
  face: BoundaryFace,
  interfaces: AuthoredInterface[],
): TypedFace["type"] {
  const iface = authoredInterfaceAtFace(face, interfaces);
  return iface ? (FACE_TYPE[iface.type] ?? "wall") : "wall";
}

/**
 * Type the actual six-direction boundary of arbitrary scene solids without
 * removing or relocating a face. The returned list is one-for-one and in the
 * same order as `computeSpaceShape(blocks).boundaryFaces`; an authored Door or
 * Window changes only `type`. This is the direct projection of the block-net
 * diagram: reciprocal handshakes pair; every unpaired NESWUD slot remains an
 * addressable surface.
 */
export function typedBoundaryFaces(
  blocks: ShapeBlock[],
  interfaces: AuthoredInterface[] = [],
): TypedFace[] {
  return computeSpaceShape(blocks).boundaryFaces.map((face) => ({
    ...face,
    type: typeAtBoundaryFace(face, interfaces),
  }));
}

/**
 * NESWUD interface surfaces: enumerate every exposed face of the shell
 * (missing horizontal handshakes × layers) and type each one from the authored
 * interface at that face — `params.span = [fromY, height]` covers the face's
 * layer — else "wall". Exactly the engine law: interface in the gap → typed
 * surface; no interface → wall surface. A Door is a first-class passable
 * surface, never an absence of wall; nothing subtracts.
 */
export function interfaceFaces(
  cells: { x: number; z: number }[],
  wallTop: number,
  interfaces: AuthoredInterface[] = [],
): TypedFace[] {
  const shape = computeSpaceShape(cells.map((c) => ({ x: c.x, y: 0, z: c.z })));

  const faces: TypedFace[] = [];
  for (const cluster of shape.clusters) {
    for (const f of cluster.boundaryFaces) {
      if (f.dir === "U" || f.dir === "D") continue;
      for (let ly = 0; ly < wallTop; ly++) {
        faces.push({
          x: f.x, z: f.z, y: ly, dir: f.dir,
          type: typeAtBoundaryFace({ ...f, y: ly }, interfaces),
        });
      }
    }
  }
  return faces;
}

/**
 * The collision-grid footprint is exactly the scene's floor cells. A missing
 * scene has no graph and therefore no collision shape; the box remains an
 * INDEX and must never be expanded into invented NESWUD cells (ruling 10).
 *
 * This function once took the space's box as a second argument, kept after the
 * body stopped reading it so callers would not have to change. That was a
 * standing invitation to the drift it was written to end: a signature that
 * accepts a box says the box participates in the answer. Removed 2026-07-26 —
 * box-based shape derivation is now unrepresentable here rather than merely
 * unused, and the compiler is the gate.
 */
export function collisionFootprint(
  floorCells: { x: number; y: number; z: number }[],
): { x: number; y: number; z: number }[] {
  return floorCells;
}

// ---------------------------------------------------------------- walkability

/**
 * Shift an editor voxel RLE stream vertically by `dy` levels. A cell (x,y,z)
 * occupies face slots at offset (z·size² + y·size + x)·6, so raising y by dy
 * moves every face block by dy·size·6 slots in the flat array. Cells pushed
 * outside [0,size) are dropped.
 *
 * The editor authors at LOCAL elevation (floor at y=0) for convenience, but a
 * space's published scene must sit at its TRUE zone elevation (floor at min_z)
 * so the reducer's grid + synthesized walls (stamped at min_z+1) align. The
 * editor shifts +min_z on publish and −min_z on load; single-floor spaces
 * (min_z=0) are unaffected.
 */
export function shiftVoxelRle(rle: number[], dy: number, size = 64): number[] {
  if (dy === 0 || !rle.length) return rle;
  const FACES = size * size * size * 6;
  const flat = new Int32Array(FACES);
  let idx = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) {
    const v = rle[i];
    const c = rle[i + 1];
    for (let j = 0; j < c && idx < FACES; j++) flat[idx++] = v;
  }
  const shifted = new Int32Array(FACES);
  // Per-cell shift with a y-bounds check: a cell whose y+dy leaves [0,size)
  // is DROPPED (the doc contract above). The old flat-offset shift only
  // clipped at the array ends, so out-of-range cells bled into the next z
  // column — diverging from the Rust law (laws::elevate_solids), which drops.
  const cells = size * size * size;
  for (let cell = 0; cell < cells; cell++) {
    const y = Math.floor(cell / size) % size;
    const ty = y + dy;
    if (ty < 0 || ty >= size) continue;
    const src = cell * 6, dst = (cell + dy * size) * 6;
    for (let f = 0; f < 6; f++) shifted[dst + f] = flat[src + f];
  }
  const out: number[] = [];
  let cur = shifted[0], n = 1;
  for (let i = 1; i < FACES; i++) {
    if (shifted[i] === cur) n++;
    else { out.push(cur, n); cur = shifted[i]; n = 1; }
  }
  out.push(cur, n);
  return out;
}

/**
 * The walkability law — shared between this engine (CLI, editor, client) and
 * the SpacetimeDB reducer (mirrored in Rust; parity is CLI-verifiable):
 *
 *   surface(x,z) = the LOWEST standable level of the column: the smallest y
 *                  with a solid block at y-1 and headroom (air at y and y+1).
 *                  This is what makes door lintels work — the wall above a
 *                  door cutout doesn't bury the floor you walk under.
 *   0            = no standable level (void or fully solid) — unwalkable.
 *   a step is legal iff |surface(to) - surface(from)| <= 1   (the stairs rule,
 *   from the staging server's height-delta check) and the target is unoccupied.
 *
 * Walls need no special case: a full wall column's only standable level is its
 * top, so stepping onto it from the floor fails the delta rule; a door opening
 * keeps the floor surface, so you walk through. Outside the footprint there
 * are no blocks.
 */
export function walkableHeights(blocks: ShapeBlock[], size = 64): number[] {
  const solid = new Set<number>();
  for (const b of blocks) {
    if (b.x < 0 || b.x >= size || b.z < 0 || b.z >= size || b.y < 0 || b.y >= size) continue;
    solid.add(b.z * size * size + b.y * size + b.x);
  }

  const heights = new Array<number>(size * size).fill(0);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      for (let y = 1; y < size; y++) {
        const below = solid.has(z * size * size + (y - 1) * size + x);
        const at = solid.has(z * size * size + y * size + x);
        const above = y + 1 < size && solid.has(z * size * size + (y + 1) * size + x);
        if (below && !at && !above) { heights[z * size + x] = y; break; }
      }
    }
  }
  return heights;
}

/** The height-delta rule for one step between adjacent columns. */
export function canStep(heights: number[], size: number, fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  if (toX < 0 || toX >= size || toZ < 0 || toZ >= size) return false;
  const to = heights[toZ * size + toX];
  if (to === 0) return false;
  const from = heights[fromZ * size + fromX] || to; // unknown origin: allow (spawn)
  return Math.abs(to - from) <= 1;
}

/**
 * The engine spawn law (SpawningSystem) expressed over the heights grid:
 * land on the requested column when standable, else the nearest standable
 * column — first with the engine's corrected-position search ordering
 * (rings of radius 1..3, x-major — MovementSystem.findNearestValidPosition),
 * then the engine's global fallback (getValidSpawnPositions, nearest by
 * distance). Returns the landing cell + surface, or null on an empty grid.
 */
export function resolveSpawn(
  heights: number[],
  size: number,
  x: number,
  z: number,
): { x: number; z: number; surface: number } | null {
  const cx = Math.max(0, Math.min(size - 1, Math.floor(x)));
  const cz = Math.max(0, Math.min(size - 1, Math.floor(z)));
  const at = (px: number, pz: number) =>
    px >= 0 && px < size && pz >= 0 && pz < size ? heights[pz * size + px] : 0;

  if (at(cx, cz) > 0) return { x: cx, z: cz, surface: at(cx, cz) };

  // engine ordering: radius rings 1..3, x-major within the ring
  for (let radius = 1; radius <= 3; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const s = at(cx + dx, cz + dz);
        if (s > 0) return { x: cx + dx, z: cz + dz, surface: s };
      }
    }
  }

  // global fallback: nearest standable column anywhere
  let best: { x: number; z: number; surface: number } | null = null;
  let bestD = Infinity;
  for (let pz = 0; pz < size; pz++) {
    for (let px = 0; px < size; px++) {
      const s = heights[pz * size + px];
      if (s === 0) continue;
      const d = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
      if (d < bestD) { bestD = d; best = { x: px, z: pz, surface: s }; }
    }
  }
  return best;
}

/**
 * The engine corrected-position suggestion (MovementSystem.validateMovement
 * correctedPosition) composed with the step law: when the step from -> to is
 * illegal, the nearest column (engine search ordering, radius <= 3) that IS a
 * legal step from `from`. Every suggestion is reducer-legal by construction.
 */
export function suggestStep(
  heights: number[],
  size: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
): { x: number; z: number; surface: number } | null {
  if (canStep(heights, size, from.x, from.z, to.x, to.z)) {
    return { x: to.x, z: to.z, surface: heights[to.z * size + to.x] };
  }
  for (let radius = 1; radius <= 3; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const nx = to.x + dx, nz = to.z + dz;
        if (canStep(heights, size, from.x, from.z, nx, nz)) {
          return { x: nx, z: nz, surface: heights[nz * size + nx] };
        }
      }
    }
  }
  return null;
}

/**
 * Graph-native A* over the height grid (4-connected; edges are legal steps
 * under the height-delta rule; `occupied` columns are blocked — the
 * occupied-tile rule). Returns the cell path including start and goal, or
 * null when unreachable.
 */
export function findPath(
  heights: number[],
  size: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
  occupied: Set<string> = new Set(),
): { x: number; z: number }[] | null {
  const key = (x: number, z: number) => z * size + x;
  if (to.x < 0 || to.x >= size || to.z < 0 || to.z >= size) return null;
  if (heights[key(to.x, to.z)] === 0 || occupied.has(`${to.x}_${to.z}`)) return null;
  if (from.x === to.x && from.z === to.z) return [{ ...from }];

  const raw = findGridPath(
    { x: from.x, y: from.z },
    { x: to.x, y: to.z },
    (x, z) =>
      x >= 0 && x < size && z >= 0 && z < size &&
      ((x === from.x && z === from.z) ||
        (heights[key(x, z)] > 0 && !occupied.has(`${x}_${z}`))),
    {
      canTraverse: (current, next) =>
        canStep(heights, size, current.x, current.y, next.x, next.y),
    }
  );

  return raw.length > 0 ? raw.map(({ x, y }) => ({ x, z: y })) : null;
}

// ---------------------------------------------------------------- internals

function boundsOf(blocks: { x: number; y: number; z: number }[]) {
  const b = {
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
  };
  for (const c of blocks) {
    if (c.x < b.minX) b.minX = c.x;
    if (c.y < b.minY) b.minY = c.y;
    if (c.z < b.minZ) b.minZ = c.z;
    if (c.x > b.maxX) b.maxX = c.x;
    if (c.y > b.maxY) b.maxY = c.y;
    if (c.z > b.maxZ) b.maxZ = c.z;
  }
  return b;
}

function normalize(cells: { x: number; y: number; z: number }[]) {
  const b = boundsOf(cells);
  return cells.map((c) => ({ x: c.x - b.minX, y: c.y - b.minY, z: c.z - b.minZ }));
}

function fnv1a64(str: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
