/**
 * space-links — the ONE TS mirror of the reducer's `derive_space_links`
 * (spacetime/src/lib.rs): a saved scene's door records -> the space_link rows
 * the reducer stores at save. `hubzz doors --verify` diffs this mirror against
 * the live table; engine-checks pins it in isolation. Keep the let-else guard
 * and the door-index (n) semantics EXACTLY aligned with the Rust.
 */
import { ShellOpening } from "./space-shape";

export interface DerivedLink {
  linkId: string; toWorld: string; x: number; z: number; spawnX: number; spawnZ: number;
  /** The space_link row's OWNER (`space_id`). Door rows are owned by the
   *  deriving space; `:entry:` rows by the exterior remainder Space. */
  ownerId: string;
}

/** A Space's full box extent, for CD-05 landing resolution. `minZ`/`maxZ` are
 *  the vertical (stacking) range — the landing is resolved at the source's
 *  own floor level, so stacked floors over the same footprint cannot collide
 *  (the publish overlap guard forbids 3D box intersection). */
export interface ZoneBox {
  minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number;
}

/** What a Space CLAIMS for landing resolution: horizontal truth is the scene's
 *  floor allocation cells (the box is an INDEX, never shape truth — rulings
 *  8/10: on an L/U footprint a doormat can sit inside the AABB while lying on
 *  exterior ground); the box supplies the VERTICAL range, and the horizontal
 *  fallback for a legacy box-only row with no scene (`cells` absent). */
export interface ZoneClaim { box: ZoneBox; cells?: Set<number> | null }

/** Zone-local floor allocation cells (idx = z*64+x) from decoded scene blocks —
 *  the TS mirror of the reducer's `scene_floor_allocation_cells`. */
export function floorAllocationCells(blocks: { x: number; y: number; z: number }[]): Set<number> {
  const cells = new Set<number>();
  for (const b of blocks) if (b.y === 0) cells.add(b.z * 64 + b.x);
  return cells;
}

/** The derived exterior Public remainder Space id — the TS mirror of the
 *  reducer's `default_public_remainder_space_id` (CONTEXT.md "Default Public
 *  remainder": outside all authored Spaces is still a Space). */
export function remainderSpaceId(zoneX: number, zoneY: number): string {
  return `zone:${zoneX}:${zoneY}:public-remainder`;
}

/** Recognize a remainder Space id; returns its zone coordinates or null. */
export function parseRemainderSpaceId(id: string): { zoneX: number; zoneY: number } | null {
  const m = /^zone:(-?\d+):(-?\d+):public-remainder$/.exec(id);
  return m ? { zoneX: Number(m[1]), zoneY: Number(m[2]) } : null;
}

/**
 * Unbounded nearest-standable over a 64x64 heights grid — the TS mirror of
 * the laws crate's `nearest_standable` (CC-06): snap_landing's exact ring
 * search with the r <= 3 cap lifted. A standable hint cell returns itself,
 * so rectangular targets keep their box-centre hint byte-for-byte.
 */
export function nearestStandable(
  heights: ArrayLike<number>, x: number, z: number,
): [number, number, number] | null {
  const GRID = 64; // deliberately byte-mirrors the Rust laws crate's GRID — do not alias.
  const surf = (cx: number, cz: number): number =>
    cx < 0 || cx >= GRID || cz < 0 || cz >= GRID ? 0 : (heights[cz * GRID + cx] ?? 0);
  const hx = Math.floor(x), hz = Math.floor(z);
  if (surf(hx, hz) > 0) return [hx + 0.5, hz + 0.5, surf(hx, hz)];
  for (let r = 1; r < GRID; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const s = surf(hx + dx, hz + dz);
        if (s > 0) return [hx + dx + 0.5, hz + dz + 0.5, s];
      }
  return null;
}

/** Mirror of laws nearest_standable_at_level (the side-tape landing law,
 *  ruling #15): the unbounded ring search restricted to one level — the tape
 *  lands on the floor's BASE walkable surface, never on wall tops. */
export function nearestStandableAtLevel(
  heights: ArrayLike<number>, x: number, z: number, level: number,
): [number, number, number] | null {
  const GRID = 64; // deliberately byte-mirrors the Rust laws crate's GRID — do not alias.
  const surf = (cx: number, cz: number): number =>
    cx < 0 || cx >= GRID || cz < 0 || cz >= GRID ? 0 : (heights[cz * GRID + cx] ?? 0);
  const hx = Math.floor(x), hz = Math.floor(z);
  if (surf(hx, hz) === level) return [hx + 0.5, hz + 0.5, level];
  for (let r = 1; r < GRID; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const s = surf(hx + dx, hz + dz);
        if (s === level) return [hx + dx + 0.5, hz + dz + 0.5, s];
      }
  return null;
}

export function deriveLinks(
  space: { spaceId: string; zoneX: number; zoneY: number },
  openings: ShellOpening[],
  boxes: Map<string, { minX: number; minY: number; maxX: number; maxY: number }>,
  grids?: Map<string, ArrayLike<number>>, // target space_walkable heights (CC-06 hint refinement)
  // CD-05 landing resolution: what the source and every OTHER Space in the
  // same zone CLAIM (floor cells; box for vertical + legacy fallback). Absent
  // (a caller with no zone data), every unresolved opening resolves to the
  // exterior remainder and nothing is skipped — matching a zone where nothing
  // else is authored.
  zone?: { source: ZoneClaim; neighbors: Map<string, ZoneClaim> },
): DerivedLink[] {
  const links: DerivedLink[] = [];
  const claims = (c: ZoneClaim, cx: number, cz: number, level: number) => {
    if (level < c.box.minZ || level > c.box.maxZ) return false;
    if (cx < 0 || cx >= 64 || cz < 0 || cz >= 64) return false;
    return c.cells
      ? c.cells.has(cz * 64 + cx)
      : c.box.minX <= cx && cx <= c.box.maxX && c.box.minY <= cz && cz <= c.box.maxY;
  };
  const level = zone?.source.box.minZ ?? 0;
  let n = 0;
  for (const o of openings) {
    if (o.fromY !== 0) continue; // windows are not transitions
    // Mirror the reducer's let-else guard: only well-formed openings emit a
    // door link (and only those advance n). Skipping malformed ones before
    // computing mid/coords keeps coordinates finite and the door index aligned
    // with derive_space_links in spacetime/src/lib.rs.
    if (o.side === undefined || !Number.isFinite(o.at) ||
        !Number.isFinite(o.from) || !Number.isFinite(o.to)) continue;
    const mid = Math.floor((o.from + o.to) / 2);
    const alongX = o.side === "zMin" || o.side === "zMax";
    const ax = alongX ? mid : o.at;
    const az = alongX ? o.at : mid;
    const out = { xMin: [-1, 0], xMax: [1, 0], zMin: [0, -1], zMax: [0, 1] }[o.side]!;
    let toWorld: string, spawnX: number, spawnZ: number;
    if (o.targetSpaceId) {
      toWorld = `space:${o.targetSpaceId}`;
      const tb = boxes.get(o.targetSpaceId);
      spawnX = tb ? Math.floor((tb.minX + tb.maxX) / 2) + 0.5 : 32.5;
      spawnZ = tb ? Math.floor((tb.minY + tb.maxY) / 2) + 0.5 : 32.5;
      // CC-06 hint refinement — mirror of the reducer's derive-time
      // nearest_standable pass; no-ops when the target grid is absent or the
      // centre is standable (all rectangular scenes).
      const tg = grids?.get(o.targetSpaceId);
      if (tg) {
        const hit = nearestStandable(tg, spawnX, spawnZ);
        if (hit) { spawnX = hit[0]; spawnZ = hit[1]; }
      }
    } else {
      // Resolve by the LANDING (CD-05): the doormat cell one step outward
      // belongs to exactly one Space — the source itself (an INTERNAL opening;
      // walking covers it, no link, but n advances so door indices stay
      // scene-order-stable), another authored Space (a 1:1 door into it), or
      // the derived exterior Public remainder Space.
      const cx = ax + out[0], cz = az + out[1];
      if (zone && claims(zone.source, cx, cz, level)) { n++; continue; }
      let neighbor: string | null = null;
      if (zone) {
        for (const [id, c] of zone.neighbors) {
          if (claims(c, cx, cz, level)) { neighbor = id; break; }
        }
      }
      toWorld = `space:${neighbor ?? remainderSpaceId(space.zoneX, space.zoneY)}`;
      spawnX = ax + out[0] + 0.5;
      spawnZ = az + out[1] + 0.5;
    }
    links.push({
      linkId: `${space.spaceId}:door:${n}`, toWorld, x: ax + 0.5, z: az + 0.5,
      spawnX, spawnZ, ownerId: space.spaceId,
    });
    // The same doorway seen from the pavement: a GROUND-FLOOR exterior door
    // also derives its reverse, owned by the exterior remainder Space —
    // activation on the doormat (GLOBAL coordinates: the exterior world tiles
    // across zones), landing on the inside threshold (zone-local, snapped to
    // the space's grid at use time).
    if (toWorld === `space:${remainderSpaceId(space.zoneX, space.zoneY)}` && level === 0) {
      links.push({
        linkId: `${space.spaceId}:entry:${n}`,
        toWorld: `space:${space.spaceId}`,
        x: space.zoneX * 64 + ax + out[0] + 0.5,
        z: space.zoneY * 64 + az + out[1] + 0.5,
        spawnX: ax + 0.5,
        spawnZ: az + 0.5,
        ownerId: remainderSpaceId(space.zoneX, space.zoneY),
      });
    }
    n++;
  }
  return links;
}
