/**
 * SpaceBuilder — space designation, exterior marking, and structure stacking utilities.
 *
 * Ported and extended from network-lab/zone-builder/src/core/Zone.Core.ts (exterior
 * detection) and network-lab/server/src/managers/Environment.Manager.ts (space grouping).
 *
 * Key concepts implemented here:
 *
 *  1. EXTERIOR MARKING — `markExteriorBlocks()`
 *     Every block whose 6-neighbour check reveals at least one exposed face is flagged
 *     `isExternal = true`.  The renderer uses this to:
 *       a) skip face generation for fully enclosed (interior) blocks
 *       b) select the correct skin (interior vs exterior) for surface blocks
 *
 *  2. UNDESIGNATED ALLOCATION → ONE DEFAULT PUBLIC SPACE — `buildDefaultPublicSpace()`
 *     Blocks not assigned to an authored Space become one Zone-wide Public
 *     remainder. Public preserves owner item-placement rights; its broad envelope
 *     avoids an authored-room height ceiling for large items. `exterior` is only
 *     a derived outside-view/streaming hint, not another authored kind.
 *
 *  3. BOTTOM-UP SPACE ORDERING — `sortSpacesByElevation()`
 *     Spaces within a structure are sorted by their lowest Z coordinate (ground floor
 *     first).  This order drives bottom-up rendering and the floor-selection UI.
 *
 *  4. STRUCTURE ENTRY POINT — `getStructureEntrySpace()`
 *     A stack of spaces forms a single structure.  The entry/lobby space is the
 *     designated spawn point for entering the whole building.  When `entrySpaceId` is
 *     set on the Structure, that space is used; otherwise the lowest-elevation space
 *     (ground floor) is the fallback.
 */

import { BlockNode, Space, Structure, createSpace } from "./schemas";
import { SpaceType } from "./constants";

// =============================================================================
// FACE-DIRECTION OFFSETS (6-neighbour check)
// =============================================================================

const FACE_OFFSETS: ReadonlyArray<{ x: number; y: number; z: number }> = [
  { x: 1, y: 0, z: 0 },  // East
  { x: -1, y: 0, z: 0 }, // West
  { x: 0, y: 1, z: 0 },  // North
  { x: 0, y: -1, z: 0 }, // South
  { x: 0, y: 0, z: 1 },  // Up
  { x: 0, y: 0, z: -1 }, // Down
];

// =============================================================================
// EXTERIOR MARKING
// =============================================================================

/**
 * Set `block.flags.isExternal` on every block in the array.
 *
 * A block is external (`true`) when at least one of its 6 faces is exposed —
 * i.e. there is no neighbouring block in that direction.
 * A block is internal (`false`) only when all 6 neighbours are present.
 *
 * This must be called after the full block set for a zone is known (not
 * incrementally per block), because adjacency depends on the complete set.
 *
 * Ported from: network-lab/zone-builder/src/core/Zone.Core.ts (lines 150–157)
 */
export function markExteriorBlocks(blocks: BlockNode[]): void {
  const occupied = new Set(blocks.map((b) => `${b.p.x},${b.p.y},${b.p.z}`));

  for (const block of blocks) {
    block.flags.isExternal = FACE_OFFSETS.some(
      (off) =>
        !occupied.has(
          `${block.p.x + off.x},${block.p.y + off.y},${block.p.z + off.z}`
        )
    );
  }
}

// =============================================================================
// UNDESIGNATED ALLOCATION → DEFAULT PUBLIC
// =============================================================================

/**
 * Return the IDs of blocks that are not assigned to any Space.
 *
 * These are allocated/placed blocks without an authored Space label. This does
 * not mean empty coordinates inside a Zone box.
 *
 * Ported from: network-lab zone model where `spaceId = -1` indicated exterior.
 */
export function getUndesignatedBlockIds(
  allBlocks: BlockNode[],
  allSpaces: Space[]
): string[] {
  const assignedIds = new Set(allSpaces.flatMap((s) => s.blockIds));
  return allBlocks
    .filter((b) => !assignedIds.has(b.id))
    .map((b) => b.id);
}

/**
 * Apply the publish-time "Default to Public" rule. All Zone allocation without
 * an authored Space designation becomes one computed Public remainder Space.
 * This is intentionally Zone-wide rather than an authored structure component:
 * it is the large outside/common placement context.
 */
export function buildDefaultPublicSpace(
  zoneId: string,
  allBlocks: BlockNode[],
  allSpaces: Space[]
): Space | null {
  const undesignatedIds = getUndesignatedBlockIds(allBlocks, allSpaces);
  if (undesignatedIds.length === 0) return null;

  const blocks = allBlocks.filter((block) => undesignatedIds.includes(block.id));
  const space = createSpace(`${zoneId}:public-remainder`, zoneId, SpaceType.Public);
  space.blockIds = undesignatedIds;
  space.tags = ["exterior"];
  space.boundingBox = {
    min: {
      x: Math.min(...blocks.map((block) => block.p.x)),
      y: Math.min(...blocks.map((block) => block.p.y)),
      z: Math.min(...blocks.map((block) => block.p.z)),
    },
    max: {
      x: Math.max(...blocks.map((block) => block.p.x)),
      y: Math.max(...blocks.map((block) => block.p.y)),
      z: Math.max(...blocks.map((block) => block.p.z)),
    },
  };
  return space;
}

// =============================================================================
// BOTTOM-UP SPACE ORDERING
// =============================================================================

/**
 * Sort spaces from lowest elevation to highest (bottom-up rendering order).
 *
 * Uses `boundingBox.min.z` as the elevation key — the Z coordinate of the
 * space's floor.  Spaces at the same elevation are left in their original
 * relative order (stable sort).
 *
 * Use this when rendering a structure's floors or presenting a floor-selector
 * UI: index 0 is ground floor, last index is top floor.
 */
export function sortSpacesByElevation(spaces: Space[]): Space[] {
  return [...spaces].sort((a, b) => a.boundingBox.min.z - b.boundingBox.min.z);
}

// =============================================================================
// STRUCTURE ENTRY POINT
// =============================================================================

/**
 * Return the entry/lobby Space for a Structure.
 *
 * Resolution order:
 *  1. If `structure.entrySpaceId` is set and matches a space in the structure → use it.
 *  2. Otherwise fall back to the lowest-elevation space (ground floor).
 *
 * Returns `undefined` when the structure has no matching spaces at all.
 *
 * The entry space is the combined spawn point for entering the building as a whole —
 * e.g. a lobby that then provides access to all upper floors via stairs or a lift
 * interface element.
 */
export function getStructureEntrySpace(
  structure: Structure,
  allSpaces: Space[]
): Space | undefined {
  const structureSpaces = allSpaces.filter((s) =>
    structure.spaceIds.includes(s.spaceId)
  );
  if (structureSpaces.length === 0) return undefined;

  if (structure.entrySpaceId) {
    const designated = structureSpaces.find(
      (s) => s.spaceId === structure.entrySpaceId
    );
    if (designated) return designated;
  }

  // Fallback: lowest elevation (ground floor)
  return sortSpacesByElevation(structureSpaces)[0];
}
