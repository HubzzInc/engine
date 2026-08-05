/**
 * NESWUD rooms bridge — interior space analysis on the engine's own laws.
 *
 * Bridged the same way space-gate/space-shape are: pure functions over the
 * engine modules, network-lab axes in, network-lab terms out.
 *
 * - Rooms = the engine's hollow spaces (HollowSpaceDetectionEngine): enclosed
 *   air pockets (>= 8 voxels) inside a solid cluster. An interior that opens
 *   to the outside (a door, a courtyard mouth, an open ceiling) is NOT a
 *   hollow — it is part of the navigable exterior-connected volume. So a
 *   detected hollow IS a sealed room: no player can ever reach it. The gate
 *   surfaces these as warnings (sealed decorative voids are legal).
 * - Exterior marking = the engine's markExteriorBlocks: a block is exterior
 *   when any of its 6 faces has no neighbor. Skins select on this flag.
 */
import { createBlockNode } from "./core/schemas";
import { BlockNodeGraph } from "./core/block-node";
import { HollowSpaceDetectionEngine } from "./core/hollow-space-detection";
import { markExteriorBlocks } from "./core/space-builder";

export type RoomDir = "N" | "E" | "S" | "W" | "U" | "D";

/** An authored interface element in network-lab axes (the door/window model),
 *  attached to the wall block at (x,y,z) facing `dir`. Same shape as the gate's
 *  UploadedInterface / space-shape AuthoredInterface — a Door/DoorLink here
 *  breaks the wall handshake so the two air regions on either side connect. */
export interface RoomInterface {
  x: number;
  y: number; // network-lab up-axis
  z: number;
  dir: RoomDir;
  type: string; // engine InterfaceType name (Door | DoorLink | Window | ...)
}

export interface RoomReport {
  /** Sealed interior air pockets (engine hollow spaces), nl coords. */
  sealedRooms: { cells: number; bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } }[];
  /** Solid connected components analyzed. */
  solidClusters: number;
  /**
   * Number of interior rooms (enclosed air pockets) a player can actually
   * REACH from the exterior by walking through Door/DoorLink openings.
   * Present only when `interfaces` are supplied to computeRooms — with no
   * interfaces the reachability model is not run and this is `undefined`
   * (blocks-only behavior is preserved exactly). Two enclosed rooms joined by
   * a connecting door read as 2 reachable rooms; a door removed leaves the far
   * room sealed (still surfaced in `sealedRooms`), so it is NOT counted here.
   */
  reachableRooms?: number;
}

function buildGraph(blocks: { x: number; y: number; z: number }[]): BlockNodeGraph {
  const graph = new BlockNodeGraph();
  const idFor = (b: { x: number; y: number; z: number }) => `r_${b.x}_${b.y}_${b.z}`;
  const seen = new Set<string>();
  for (const b of blocks) {
    const k = idFor(b);
    if (seen.has(k)) continue;
    seen.add(k);
    // nl (x, up=y, z) -> engine (x, y=depth, z=up)
    graph.addBlock(createBlockNode(k, "rooms", { x: b.x, y: b.z, z: b.y }));
  }
  for (const k of seen) {
    graph.autoLinkBlock(k);
  }
  return graph;
}

/** nl (x, up=y, z) direction -> unit offset in nl coords. */
const ROOM_DIR_OFFSET: Record<RoomDir, { dx: number; dy: number; dz: number }> = {
  N: { dx: 0, dy: 0, dz: 1 },
  S: { dx: 0, dy: 0, dz: -1 },
  E: { dx: 1, dy: 0, dz: 0 },
  W: { dx: -1, dy: 0, dz: 0 },
  U: { dx: 0, dy: 1, dz: 0 },
  D: { dx: 0, dy: -1, dz: 0 },
};

const cellKey = (x: number, y: number, z: number) => `${x}_${y}_${z}`;

/**
 * Reachability model over the air volume: flood the empty cells inside the
 * payload's bounding box (padded by 1 so the outside is one connected region),
 * label each air component, then union components that a Door/DoorLink opening
 * physically joins (the wall cell an opening sits on connects the air on its
 * two faces). Returns how many INTERIOR air components end up in the exterior's
 * union group — i.e. rooms a player can actually reach by walking in.
 *
 * Pure and engine-grounded (six-handshake air adjacency = the NESWUD neighbor
 * offsets); no dependency on the hollow detector's synthetic block ids.
 */
function reachableRoomCount(
  blocks: { x: number; y: number; z: number }[],
  interfaces: RoomInterface[],
): number {
  if (blocks.length === 0) return 0;
  const solid = new Set<string>();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of blocks) {
    solid.add(cellKey(b.x, b.y, b.z));
    if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
    if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
    if (b.z < minZ) minZ = b.z; if (b.z > maxZ) maxZ = b.z;
  }
  // Pad by 1 so the exterior shell of air is a single connected region.
  const lo = { x: minX - 1, y: minY - 1, z: minZ - 1 };
  const hi = { x: maxX + 1, y: maxY + 1, z: maxZ + 1 };
  const inBox = (x: number, y: number, z: number) =>
    x >= lo.x && x <= hi.x && y >= lo.y && y <= hi.y && z >= lo.z && z <= hi.z;

  // Label each air cell with its connected-component id (6-neighbour flood).
  const label = new Map<string, number>();
  const compCells: number[] = []; // component id -> cell count
  let exteriorComp = -1;
  const dirs = Object.values(ROOM_DIR_OFFSET);
  for (let x = lo.x; x <= hi.x; x++) {
    for (let y = lo.y; y <= hi.y; y++) {
      for (let z = lo.z; z <= hi.z; z++) {
        const k = cellKey(x, y, z);
        if (solid.has(k) || label.has(k)) continue;
        const id = compCells.length;
        compCells.push(0);
        const queue: [number, number, number][] = [[x, y, z]];
        label.set(k, id);
        let touchesEdge = false;
        while (queue.length) {
          const [cx, cy, cz] = queue.pop()!;
          compCells[id]++;
          if (cx === lo.x || cx === hi.x || cy === lo.y || cy === hi.y || cz === lo.z || cz === hi.z) {
            touchesEdge = true;
          }
          for (const d of dirs) {
            const nx = cx + d.dx, ny = cy + d.dy, nz = cz + d.dz;
            if (!inBox(nx, ny, nz)) continue;
            const nk = cellKey(nx, ny, nz);
            if (solid.has(nk) || label.has(nk)) continue;
            label.set(nk, id);
            queue.push([nx, ny, nz]);
          }
        }
        // The padded outer air (any component reaching the box edge) is the exterior.
        if (touchesEdge) exteriorComp = id;
      }
    }
  }
  if (compCells.length === 0) return 0;

  // Union-find over air components; a Door/DoorLink joins the air on its two faces.
  const parent = compCells.map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const iface of interfaces) {
    if (iface.type !== "Door" && iface.type !== "DoorLink") continue; // only doors admit a player
    const off = ROOM_DIR_OFFSET[iface.dir];
    if (!off) continue;
    // The two air cells on the faces of the wall cell the opening sits on.
    const aKey = cellKey(iface.x + off.dx, iface.y + off.dy, iface.z + off.dz);
    const bKey = cellKey(iface.x - off.dx, iface.y - off.dy, iface.z - off.dz);
    const a = label.get(aKey);
    const b = label.get(bKey);
    if (a !== undefined && b !== undefined) union(a, b);
  }

  if (exteriorComp === -1) return 0;
  const extRoot = find(exteriorComp);
  // Count INTERIOR components (not the exterior itself) now joined to the exterior.
  let reachable = 0;
  for (let i = 0; i < compCells.length; i++) {
    if (i === exteriorComp) continue;
    if (find(i) === extRoot) reachable++;
  }
  return reachable;
}

/** Detect sealed rooms (engine hollow spaces) in a block payload.
 *  The engine floods air strictly within each cluster's bounding box, so a
 *  passage breaching the cluster face still reads as a hollow — the bridge
 *  adds the breach test: a hollow whose extent touches its cluster's bbox
 *  face is OPEN to the outside, not sealed.
 *
 *  Optionally pass authored `interfaces` (Door/DoorLink openings): the report
 *  then also carries `reachableRooms` — the number of interior air pockets a
 *  player can walk into from the exterior through those doors. Omitting
 *  `interfaces` preserves the blocks-only behavior exactly (no reachability
 *  field). */
export function computeRooms(
  blocks: { x: number; y: number; z: number }[],
  interfaces?: RoomInterface[],
): RoomReport {
  const graph = buildGraph(blocks);
  const analysis = new HollowSpaceDetectionEngine().analyzeAllSpaces(graph, "rooms");
  const sealed = analysis.hollowSpaces.filter((h) => {
    const parent = analysis.solidSpaces.find(
      (s) =>
        h.boundingBox.min.x >= s.boundingBox.min.x && h.boundingBox.max.x <= s.boundingBox.max.x &&
        h.boundingBox.min.y >= s.boundingBox.min.y && h.boundingBox.max.y <= s.boundingBox.max.y &&
        h.boundingBox.min.z >= s.boundingBox.min.z && h.boundingBox.max.z <= s.boundingBox.max.z,
    );
    if (!parent) return false;
    const p = parent.boundingBox;
    return (
      h.boundingBox.min.x > p.min.x && h.boundingBox.max.x < p.max.x &&
      h.boundingBox.min.y > p.min.y && h.boundingBox.max.y < p.max.y &&
      h.boundingBox.min.z > p.min.z && h.boundingBox.max.z < p.max.z
    );
  });
  const report: RoomReport = {
    solidClusters: analysis.solidSpaces.length,
    sealedRooms: sealed.map((h) => ({
      cells: h.blockIds.length,
      bounds: {
        // engine (x, y=depth, z=up) -> nl (x, y=up, z)
        minX: h.boundingBox.min.x,
        minY: h.boundingBox.min.z,
        minZ: h.boundingBox.min.y,
        maxX: h.boundingBox.max.x,
        maxY: h.boundingBox.max.z,
        maxZ: h.boundingBox.max.y,
      },
    })),
  };
  // Reachability is only computed when interfaces are supplied — omitting them
  // keeps the blocks-only output byte-identical (no reachableRooms field).
  if (interfaces !== undefined) {
    report.reachableRooms = reachableRoomCount(blocks, interfaces);
  }
  return report;
}

/** The engine exterior-marking law: cells with any exposed face (skins key
 *  on this — interior vs exterior). Returns nl "x_y_z" keys. */
export function exteriorCells(blocks: { x: number; y: number; z: number }[]): Set<string> {
  const graph = buildGraph(blocks);
  const all = graph.getAllBlocks();
  markExteriorBlocks(all);
  const out = new Set<string>();
  for (const b of all) {
    if ((b.flags as any).isExternal) out.add(`${b.p.x}_${b.p.z}_${b.p.y}`); // engine -> nl
  }
  return out;
}
