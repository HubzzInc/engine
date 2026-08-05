/**
 * Shell view = the SPACE BOUNDING BOX the docs outline — not per-voxel faces.
 *
 * Spec (SPEC-ZONE-ARCHITECTURE §7.1):
 *   boundingBox: { minX, minY, minZ, maxX, maxY, maxZ }
 *
 * Python twin (zone_engine Space._optimize):
 *   bounding_box = ((rx,ry,min_x,min_y,min_z), (rx,ry,max_x,max_y,max_z))
 *
 * STDB mirror: space.min_x/min_y/min_z/max_x/max_y/max_z (the index box).
 *
 * Canon ruling 10: the box is an INDEX for subscriptions / city-map markers /
 * structure stack elevation — "just the bounding boxes of the structures that
 * were published." It is NOT shape truth (ADR 0002: shape truth is NESWUD
 * boundary faces via computeSpaceShape).
 *
 * What this module is NOT:
 *   - dollhouse / flood-fill wall mesh → computeSpaceShape.boundaryFaces
 *   - outer-wall synthesis for validation → synthesizeShellWalls / perimeterCells
 */

import type { ShapeBlock } from "./space-shape";

/** Axis-aligned bounding box in the same coords as the voxels (y = up). */
export interface BoundingBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Width/depth/height in cells (inclusive integer range → count). */
export function boxSize(b: BoundingBox): { w: number; h: number; d: number } {
  return {
    w: b.maxX - b.minX + 1,
    h: b.maxY - b.minY + 1,
    d: b.maxZ - b.minZ + 1,
  };
}

/**
 * Shell view input: solid voxels of one space (or empty → null).
 * Matches Python Space._optimize min/max over voxel axes.
 */
export function boundingBoxFromBlocks(blocks: Iterable<ShapeBlock>): BoundingBox | null {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let any = false;
  for (const b of blocks) {
    any = true;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.z < minZ) minZ = b.z;
    if (b.x > maxX) maxX = b.x;
    if (b.y > maxY) maxY = b.y;
    if (b.z > maxZ) maxZ = b.z;
  }
  if (!any) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Shell view from an already-stored index box (STDB space row / structure box).
 * Pass-through normalizer — same field names as SPEC §7.1.
 */
export function boundingBoxFromIndex(box: {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}): BoundingBox {
  return {
    minX: box.minX, minY: box.minY, minZ: box.minZ,
    maxX: box.maxX, maxY: box.maxY, maxZ: box.maxZ,
  };
}

/** Alias the docs use: "shell view" === this box. */
export const shellViewBox = boundingBoxFromBlocks;
