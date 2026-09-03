/**
 * scene-codec — the ONE TS decode/read law for a saved scene payload.
 *
 * The editor persists voxels as an RLE stream over FLAT face-slots (6 per
 * cell; VoxelZone.getVoxelOffset ordering: offset = (z*64*64 + y*64 + x) * 6).
 * This decode previously existed three times (CLI, world-client Dollhouse,
 * and mirrored in Rust as laws::solids_from_rle) — the TS copies now live
 * here alone; the Rust law is byte-parity-checked against this via the CI
 * `walkable --verify` grid comparison.
 */
import type { AuthoredInterface, ShellOpening } from "./space-shape";
import { interfacesToOpenings, openingsToInterfaces } from "./space-shape";
import { ZONE_GRID_SIZE } from "./core/constants";

const ZONE = ZONE_GRID_SIZE;

export type SceneBlock = { x: number; y: number; z: number; type: number };

/**
 * Encode sparse solid cells into the editor's canonical flat face-slot RLE.
 *
 * Every voxel occupies six consecutive slots. The stream covers the complete
 * zone buffer so it is byte-compatible with `VoxelZone.serialize()`, while
 * adjacent runs are coalesced to keep sparse scenes compact. Invalid/out-of-
 * bounds cells and reserved air/blank types (0/1) are ignored.
 */
export function encodeSceneBlocks(
  blocks: Iterable<SceneBlock>,
): number[] {
  const cellTypes = new Map<number, number>();
  for (const block of blocks) {
    if (
      !Number.isInteger(block.x) || !Number.isInteger(block.y) || !Number.isInteger(block.z) ||
      block.x < 0 || block.x >= ZONE || block.y < 0 || block.y >= ZONE ||
      block.z < 0 || block.z >= ZONE || !Number.isInteger(block.type) || block.type <= 1
    ) continue;
    const cell = block.z * ZONE * ZONE + block.y * ZONE + block.x;
    cellTypes.set(cell, Math.max(cellTypes.get(cell) ?? 0, block.type));
  }

  const encoded: number[] = [];
  const append = (value: number, count: number) => {
    if (count <= 0) return;
    const last = encoded.length - 2;
    if (last >= 0 && encoded[last] === value) encoded[last + 1] += count;
    else encoded.push(value, count);
  };

  let cursor = 0;
  for (const cell of [...cellTypes.keys()].sort((a, b) => a - b)) {
    const offset = cell * 6;
    append(0, offset - cursor);
    append(cellTypes.get(cell)!, 6);
    cursor = offset + 6;
  }
  append(0, ZONE * ZONE * ZONE * 6 - cursor);
  return encoded;
}

/** Decode the editor's RLE voxel stream -> solid cells (zone-local coords). */
export function decodeSceneBlocks(
  encoded: number[],
): SceneBlock[] {
  const blocks: SceneBlock[] = [];
  const seen = new Set<number>();
  let flat = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    const value = encoded[i], count = encoded[i + 1];
    if (value > 1) {
      for (let j = 0; j < count; j++) {
        const cell = Math.floor((flat + j) / 6);
        if (seen.has(cell)) continue;
        seen.add(cell);
        blocks.push({
          x: cell % ZONE,
          y: Math.floor(cell / ZONE) % ZONE,
          z: Math.floor(cell / (ZONE * ZONE)),
          type: value,
        });
      }
    }
    flat += count;
  }
  return blocks;
}

/** A saved scene's openings + interfaces: prefers authored `interfaces`,
 *  lifts legacy `openings` otherwise; `doors` = distinct Door/DoorLink cells. */
export function sceneOpenings(scene: any): {
  openings: ShellOpening[]; interfaces: AuthoredInterface[]; doors: number;
} {
  const hasAuthoredInterfaces = Array.isArray(scene?.interfaces);
  const legacyOpenings: ShellOpening[] = Array.isArray(scene?.openings) ? scene.openings : [];
  const interfaces: AuthoredInterface[] = hasAuthoredInterfaces
    ? scene.interfaces
    : openingsToInterfaces(legacyOpenings);
  const openings = hasAuthoredInterfaces
    ? interfacesToOpenings(interfaces)
    : legacyOpenings;
  const doors = new Set(
    interfaces.filter((i) => i.type === "Door" || i.type === "DoorLink").map((i) => `${i.dir}_${i.x}_${i.z}`),
  ).size;
  return { openings, interfaces, doors };
}
