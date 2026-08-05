/**
 * Validation Rule Sets (Automated)
 * Implements all validation rules from the technical specification
 */

import {
  BlockNode,
  BoundingBox,
  Space,
  Structure,
  Zone,
  ValidationError,
  ValidationContext,
  ValidationResult,
} from "./schemas";
import {
  ValidationStatus,
  ZONE_BUDGETS,
  MIN_SPACE_HEIGHT,
  MIN_FLOOR_AREA,
  MIN_WALL_WIDTH,
  FLOOR_HEIGHT_RATIO,
  OCCUPANCY_DENSITY_FACTOR,
  STRUCTURE_SEPARATION,
  ALLOWED_HEIGHTS,
  SpaceType,
  InterfaceType,
} from "./constants";
import { calculateSpaceMetrics } from "./space";
import { findPath } from "./pathfinder";

// =============================================================================
// VALIDATION ENGINE
// =============================================================================

/**
 * Modular rule parameters — every threshold the simulator/CLI can sweep.
 * Defaults are the canon constants; override any subset per run.
 */
export interface ValidationRuleConfig {
  /** Minimum interior height (blocks). */
  minSpaceHeight: number;
  /** Minimum floor tiles per space. */
  minFloorArea: number;
  /** Minimum corridor/space width (tiles). */
  minCorridorWidth: number;
  /** Allowed (quantized) stack heights; empty list = any height >= minSpaceHeight. */
  allowedHeights: number[];
  /** Occupancy density divisor: max concurrency = floorArea / density. */
  occupancyDensity: number;
  /** Private spaces must declare at least one Door/DoorLink interface. */
  requireEntranceForPrivate: boolean;
  /** DoorLink interfaces must name an existing target space (when the caller
   *  supplies the known-space set). */
  validateDoorLinkTargets: boolean;
}

export const DEFAULT_RULES: ValidationRuleConfig = {
  minSpaceHeight: MIN_SPACE_HEIGHT,
  minFloorArea: MIN_FLOOR_AREA,
  minCorridorWidth: MIN_WALL_WIDTH,
  allowedHeights: [...ALLOWED_HEIGHTS],
  occupancyDensity: OCCUPANCY_DENSITY_FACTOR,
  requireEntranceForPrivate: true,
  validateDoorLinkTargets: true,
};

/**
 * Two axis-aligned bounding boxes intersect iff they overlap on ALL three
 * axes (x, y, z).  Bounds are inclusive block coordinates — two boxes that
 * share a face (gap 0 on one axis) overlap on that axis, so two spaces
 * whose boxes touch on all three axes DO intersect (they share voxels).
 *
 * Overlap on one axis: intervals [aMin, aMax] and [bMin, bMax] overlap iff
 * aMin <= bMax AND bMin <= aMax.
 */
export function boxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.min.x <= b.max.x && b.min.x <= a.max.x &&
    a.min.y <= b.max.y && b.min.y <= a.max.y &&
    a.min.z <= b.max.z && b.min.z <= a.max.z
  );
}

/**
 * Comprehensive validation engine for all Hubzz voxel rules
 */
export class ValidationEngine {
  readonly rules: ValidationRuleConfig;

  constructor(rules: Partial<ValidationRuleConfig> = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
  }

  /**
   * Validate a complete zone configuration
   */
  validateZone(
    zone: Zone,
    blocks: BlockNode[],
    spaces: Space[],
    structures: Structure[],
    knownSpaceIds?: string[],
    spineReachable?: boolean
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Budget validation
    errors.push(...this.validateBlockBudget(zone, blocks));

    // Space validation
    for (const space of spaces) {
      errors.push(...this.validateSpace(space, blocks));
    }

    // Space intersection — two spaces in the same zone may never overlap
    // (bounding boxes must not intersect on all three axes).
    errors.push(...this.validateSpaceIntersections(spaces));

    // Structure validation
    for (const structure of structures) {
      errors.push(...this.validateStructure(structure, spaces, blocks));
    }

    // Inter-structure separation
    errors.push(...this.validateStructureSeparation(structures, spaces, blocks));

    // Interface validation (entrances, door-link targets)
    errors.push(...this.validateInterfaces(blocks, spaces, knownSpaceIds, spineReachable));

    return {
      status:
        errors.length === 0 ? ValidationStatus.Pass : ValidationStatus.Fail,
      errors: errors.map((e) => e.message),
    };
  }

  /**
   * Validate interface elements (doors/windows/door-links) attached to blocks:
   * - Private spaces require at least one entrance the navigation system can
   *   verify reachability through: a Door/DoorLink interface, OR membership in
   *   a multi-space structure (a stacked private floor is reached by the
   *   structure spine — the spine IS its entrance, so `spineReachable` waives
   *   the door requirement).
   * - DoorLink interfaces must name a target space that exists (checked only
   *   when the caller supplies the known-space set).
   */
  private validateInterfaces(
    blocks: BlockNode[],
    spaces: Space[],
    knownSpaceIds?: string[],
    spineReachable?: boolean
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const blocksById = new Map(blocks.map((b) => [b.id, b]));

    if (this.rules.requireEntranceForPrivate && !spineReachable) {
      for (const space of spaces) {
        if (space.type !== SpaceType.Private) continue;
        const hasEntrance = space.blockIds.some((id) => {
          const block = blocksById.get(id);
          return block?.interfaces.some(
            (i) =>
              i.type === InterfaceType.Door || i.type === InterfaceType.DoorLink
          );
        });
        if (!hasEntrance) {
          errors.push({
            code: "ENTRANCE_REQUIRED",
            message: `Private space ${space.spaceId} requires at least one entrance (Door)`,
            spaceId: space.spaceId,
          });
        }
      }
    }

    if (this.rules.validateDoorLinkTargets) {
      const known = knownSpaceIds ? new Set(knownSpaceIds) : null;
      for (const block of blocks) {
        for (const iface of block.interfaces) {
          if (iface.type !== InterfaceType.DoorLink) continue;
          const target = iface.params?.["targetSpaceId"];
          if (typeof target !== "string" || target.length === 0) {
            errors.push({
              code: "DOORLINK_TARGET_MISSING",
              message: `DoorLink on block ${block.id} has no targetSpaceId`,
              blockId: block.id,
            });
          } else if (known && !known.has(target)) {
            errors.push({
              code: "DOORLINK_TARGET_MISSING",
              message: `DoorLink on block ${block.id} targets unknown space '${target}'`,
              blockId: block.id,
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate block budget constraints
   */
  validateBlockBudget(zone: Zone, blocks: BlockNode[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const maxBlocks = ZONE_BUDGETS[zone.tier as keyof typeof ZONE_BUDGETS];

    if (blocks.length > maxBlocks) {
      errors.push({
        code: "BUDGET_EXCEEDED",
        message: `Zone ${zone.zoneId} exceeds block budget: ${blocks.length}/${maxBlocks}`,
        details: {
          used: blocks.length,
          budget: maxBlocks,
          tier: zone.tier,
        },
      });
    }

    return errors;
  }

  /**
   * Validate that no two spaces in the same zone intersect.  Two spaces
   * intersect when their bounding boxes overlap on all three axes (x, y, z).
   * Spaces in different zones can never intersect.
   */
  validateSpaceIntersections(spaces: Space[]): ValidationError[] {
    const errors: ValidationError[] = [];
    for (let i = 0; i < spaces.length; i++) {
      for (let j = i + 1; j < spaces.length; j++) {
        const a = spaces[i]!;
        const b = spaces[j]!;
        if (a.zoneId !== b.zoneId) continue;
        if (boxesIntersect(a.boundingBox, b.boundingBox)) {
          errors.push({
            code: "SPACE_INTERSECTION",
            message: `Space ${a.spaceId} intersects space ${b.spaceId} in zone ${a.zoneId}`,
            spaceId: a.spaceId,
            details: { otherSpaceId: b.spaceId, zoneId: a.zoneId },
          });
        }
      }
    }
    return errors;
  }

  /**
   * Validate a candidate space's bounding box against a set of existing
   * published spaces (in the same zone).  Rejects if any existing space
   * intersects the candidate.  This is the publish-time check: the candidate
   * is a new/updated space being published, and `existing` are the bounding
   * boxes of spaces already live in the zone.
   */
  validateSpaceIntersection(
    candidate: BoundingBox,
    existing: BoundingBox[],
    candidateSpaceId?: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    for (const other of existing) {
      if (boxesIntersect(candidate, other)) {
        errors.push({
          code: "SPACE_INTERSECTION",
          message: `Space ${candidateSpaceId ?? "candidate"} intersects an existing space in this zone`,
          spaceId: candidateSpaceId,
        });
      }
    }
    return errors;
  }

  /**
   * Validate a single space against all space rules
   */
  validateSpace(space: Space, allBlocks: BlockNode[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const metrics = calculateSpaceMetrics(space);

    // Minimum height validation
    if (metrics.height < this.rules.minSpaceHeight) {
      errors.push({
        code: "SPACE_TOO_SHORT",
        message: `Space ${space.spaceId} height ${metrics.height} < minimum ${this.rules.minSpaceHeight}`,
        spaceId: space.spaceId,
        details: { height: metrics.height, minimum: this.rules.minSpaceHeight },
      });
    }

    // Minimum floor area validation
    // Quantized stack heights (e.g. 2/4/6/8): the height must be one of the
    // fixed tiers when a tier list is configured.
    if (
      this.rules.allowedHeights.length > 0 &&
      metrics.height >= this.rules.minSpaceHeight &&
      !this.rules.allowedHeights.includes(metrics.height)
    ) {
      errors.push({
        code: "HEIGHT_NOT_QUANTIZED",
        message: `Space ${space.spaceId} height ${metrics.height} not an allowed tier (${this.rules.allowedHeights.join("/")})`,
        spaceId: space.spaceId,
        details: { height: metrics.height, allowed: this.rules.allowedHeights },
      });
    }

    if (metrics.floorArea < this.rules.minFloorArea) {
      errors.push({
        code: "SPACE_TOO_SMALL",
        message: `Space ${space.spaceId} floor area ${metrics.floorArea} < minimum ${this.rules.minFloorArea}`,
        spaceId: space.spaceId,
        details: { floorArea: metrics.floorArea, minimum: this.rules.minFloorArea },
      });
    }

    // Floor-to-height ratio validation
    const requiredFloorArea = FLOOR_HEIGHT_RATIO * metrics.height;
    if (metrics.floorArea < requiredFloorArea) {
      errors.push({
        code: "INVALID_FLOOR_HEIGHT_RATIO",
        message: `Space ${space.spaceId} floor area ${metrics.floorArea} < required ${requiredFloorArea} for height ${metrics.height}`,
        spaceId: space.spaceId,
        details: {
          floorArea: metrics.floorArea,
          height: metrics.height,
          required: requiredFloorArea,
        },
      });
    }

    // Width validation — the erosion law (the oracle's `_check_min_width`):
    // the floor must contain at least one cell with all four horizontal
    // neighbors (a genuinely 3-wide area). Bounding-box dims were a weaker
    // proxy: a 2-wide zigzag with a large bounding box passed (drift class
    // caught by the M5 oracle cross-check; erosion implies bounding, never
    // the reverse).
    const bounds = space.boundingBox;
    const spaceIdSet = new Set(space.blockIds);
    const floorCells = new Set(
      allBlocks
        .filter((b) => spaceIdSet.has(b.id) && b.p.z === bounds.min.z)
        .map((b) => `${b.p.x}_${b.p.y}`)
    );
    let hasWideArea = false;
    for (const k of floorCells) {
      const [fx, fy] = k.split("_").map(Number);
      if (
        floorCells.has(`${fx + 1}_${fy}`) &&
        floorCells.has(`${fx - 1}_${fy}`) &&
        floorCells.has(`${fx}_${fy + 1}`) &&
        floorCells.has(`${fx}_${fy - 1}`)
      ) {
        hasWideArea = true;
        break;
      }
    }

    if (!hasWideArea) {
      errors.push({
        code: "SPACE_TOO_NARROW",
        message: `Space ${space.spaceId} has no ${this.rules.minCorridorWidth}-wide area (erosion test)`,
        spaceId: space.spaceId,
        details: { minimum: this.rules.minCorridorWidth },
      });
    }

    // Enclosure validation
    errors.push(...this.validateSpaceEnclosure(space, allBlocks));

    // Reachability validation
    errors.push(...this.validateSpaceReachability(space, allBlocks));

    return errors;
  }

  /**
   * Validate space enclosure (walls, floor, ceiling)
   */
  validateSpaceEnclosure(
    space: Space,
    allBlocks: BlockNode[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const spaceBlocks = allBlocks.filter((b) => space.blockIds.includes(b.id));

    // The side-tape servability rule (ruling #15, T3) — replaces the old
    // "continuous interior block column" law (vacuous: the floor-completeness
    // rule already forces a spanning column under every legal payload). Stories
    // now connect via the side-tape, never a mandatory interior column. A
    // STORY = a level with an exposed top (air at l+1 over some block);
    // buried levels (solid fill) are legal mounds, not stories. Every story
    // needs HEADROOM — air at l+2 over some cell of the story — matching the
    // walkable law's 2-air clearance: a floor under a 1-high ceiling is
    // unusable, so the tape can't serve it.
    const solid = new Set(spaceBlocks.map((b) => `${b.p.x}_${b.p.y}_${b.p.z}`));
    const has = (x: number, y: number, z: number) => solid.has(`${x}_${y}_${z}`);
    const levels = [...new Set(spaceBlocks.map((b) => b.p.z))].sort((a, b) => a - b);
    for (const l of levels) {
      const cells = spaceBlocks.filter((b) => b.p.z === l);
      const isStory = cells.some((b) => !has(b.p.x, b.p.y, l + 1));
      if (!isStory) continue; // buried level — a legal solid mound, not a story
      const headroom = cells.some((b) => !has(b.p.x, b.p.y, l + 1) && !has(b.p.x, b.p.y, l + 2));
      if (!headroom) {
        errors.push({
          code: "LEVEL_NOT_SERVABLE",
          message: `Space ${space.spaceId} story at level ${l} has no headroom (the side-tape can't serve a 1-high gap)`,
          spaceId: space.spaceId,
          details: { level: l },
        });
      }
    }

    // Validate floor completeness
    const missingFloorTiles = this.findMissingFloorTiles(space, spaceBlocks);
    if (missingFloorTiles.length > 0) {
      errors.push({
        code: "INCOMPLETE_FLOOR",
        message: `Space ${space.spaceId} has missing floor tiles`,
        spaceId: space.spaceId,
        details: { missingTiles: missingFloorTiles },
      });
    }

    return errors;
  }

  /**
   * Check if there's a vertical column at given coordinates
   */
  /**
   * Find missing floor tiles in a space.
   *
   * Shape truth comes from the block columns (the handshake graph), NOT the
   * bounding box: odd footprints (L, U) leave bounding-box cells legitimately
   * empty. A floor tile is MISSING only when:
   *   - an occupied column has no base block (floating walls, floor gap under
   *     a structure), or
   *   - an empty column is fully enclosed by the footprint (a hole) AND
   *     exposed to the navigable floor — i.e. some adjacent floor tile has no
   *     wall/fence between it and the drop. A fenced courtyard is a legal
   *     deliberately-broken-handshake; an open pothole is not.
   */
  private findMissingFloorTiles(
    space: Space,
    blocks: BlockNode[]
  ): Array<{ x: number; y: number }> {
    const bounds = space.boundingBox;
    const floorZ = bounds.min.z;

    const occupied = new Set<string>(); // columns with any block
    const baseAt = new Set<string>(); // columns with a block at floor level
    const fenceAt = new Set<string>(); // columns with a block just above the floor

    for (const b of blocks) {
      const k = `${b.p.x},${b.p.y}`;
      occupied.add(k);
      if (b.p.z === floorZ) baseAt.add(k);
      if (b.p.z === floorZ + 1) fenceAt.add(k);
    }

    // Flood fill the empty cells reachable from outside the footprint —
    // anything not reached is an enclosed hole (courtyard candidate).
    const outside = new Set<string>();
    const queue: Array<[number, number]> = [[bounds.min.x - 1, bounds.min.y - 1]];
    while (queue.length) {
      const next = queue.pop();
      if (!next) break;
      const [x, y] = next;
      if (
        x < bounds.min.x - 1 || x > bounds.max.x + 1 ||
        y < bounds.min.y - 1 || y > bounds.max.y + 1
      ) continue;
      const k = `${x},${y}`;
      if (outside.has(k) || occupied.has(k)) continue;
      outside.add(k);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    const missing: Array<{ x: number; y: number }> = [];

    for (let x = bounds.min.x; x <= bounds.max.x; x++) {
      for (let y = bounds.min.y; y <= bounds.max.y; y++) {
        const k = `${x},${y}`;

        if (occupied.has(k)) {
          // a column of blocks with nothing at floor level = floating structure
          if (!baseAt.has(k)) missing.push({ x, y });
          continue;
        }

        if (outside.has(k)) continue; // outside the footprint (odd shape) — legal

        // enclosed hole: legal only if every adjacent floor tile is fenced off
        const exposed = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nk = `${x + dx},${y + dy}`;
          return baseAt.has(nk) && !fenceAt.has(nk);
        });
        if (exposed) missing.push({ x, y });
      }
    }

    return missing;
  }

  /**
   * Validate space reachability — all navigable floor tiles must be connected.
   *
   * Movement in Hubzz is on the bottom surface texture of a space's defined
   * block cluster, not on top of individual block surfaces. A block is part of
   * the navigable floor when it is a foundation block or the lowest block in
   * its column within the space. `walkableTop` marks blocks whose face
   * participates in this traversable surface layer.
   *
   * Uses A* (`findPath`) to verify that every floor tile can be reached from
   * the first spawn point. This surfaces structural gaps and isolated pockets
   * that would prevent full navigation of the space.
   */
  validateSpaceReachability(
    space: Space,
    allBlocks: BlockNode[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const spaceBlocks = allBlocks.filter((b) => space.blockIds.includes(b.id));
    const floorBlocks = spaceBlocks.filter(
      (b) => b.flags.foundation || this.isFloorLevel(b, spaceBlocks)
    );

    if (floorBlocks.length === 0) {
      errors.push({
        code: "NO_FLOOR_BLOCKS",
        message: `Space ${space.spaceId} has no floor blocks`,
        spaceId: space.spaceId,
      });
      return errors;
    }

    // Spawn points: floor blocks whose surface is on the navigable layer
    const spawnPoints = floorBlocks.filter((b) => b.flags.walkableTop);
    if (spawnPoints.length === 0) {
      errors.push({
        code: "NO_SPAWN_POINTS",
        message: `Space ${space.spaceId} has no valid spawn points`,
        spaceId: space.spaceId,
      });
      return errors;
    }

    const [firstSpawn] = spawnPoints;
    if (!firstSpawn) return errors;

    // Build walkability map: a floor tile is navigable if it carries walkableTop
    const walkableSet = new Set(
      floorBlocks
        .filter((b) => b.flags.walkableTop)
        .map((b) => `${b.p.x},${b.p.y}`)
    );
    const isWalkable = (x: number, y: number) => walkableSet.has(`${x},${y}`);

    // Use A* to confirm every other spawn-eligible tile is reachable from firstSpawn
    const start = { x: firstSpawn.p.x, y: firstSpawn.p.y };
    let unreachableCount = 0;

    for (const tile of spawnPoints) {
      if (tile.p.x === firstSpawn.p.x && tile.p.y === firstSpawn.p.y) continue;
      const path = findPath(start, { x: tile.p.x, y: tile.p.y }, isWalkable);
      if (path.length === 0) unreachableCount++;
    }

    if (unreachableCount > 0) {
      errors.push({
        code: "UNREACHABLE_AREAS",
        message: `Space ${space.spaceId} has unreachable floor areas`,
        spaceId: space.spaceId,
        details: { unreachableCount },
      });
    }

    return errors;
  }

  /**
   * Check if a block is at floor level
   */
  private isFloorLevel(block: BlockNode, allBlocks: BlockNode[]): boolean {
    const belowPos = { x: block.p.x, y: block.p.y, z: block.p.z - 1 };
    return !allBlocks.some(
      (b) =>
        b.p.x === belowPos.x && b.p.y === belowPos.y && b.p.z === belowPos.z
    );
  }

  /**
   * Validate structure constraints
   */
  validateStructure(
    structure: Structure,
    allSpaces: Space[],
    _allBlocks: BlockNode[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const structureSpaces = allSpaces.filter((s) =>
      structure.spaceIds.includes(s.spaceId)
    );

    if (structureSpaces.length === 0) {
      errors.push({
        code: "EMPTY_STRUCTURE",
        message: `Structure ${structure.structureId} contains no valid spaces`,
        details: { structureId: structure.structureId },
      });
    }

    // Validate space connectivity within structure
    if (structureSpaces.length > 1) {
      const connected = this.validateStructureConnectivity(structureSpaces);
      if (!connected) {
        errors.push({
          code: "DISCONNECTED_STRUCTURE",
          message: `Structure ${structure.structureId} contains disconnected spaces`,
          details: { structureId: structure.structureId },
        });
      }
    }

    return errors;
  }

  /**
   * Validate that spaces within a structure are connected
   */
  private validateStructureConnectivity(spaces: Space[]): boolean {
    if (spaces.length <= 1) return true;

    const visited = new Set<string>();
    const startSpace = spaces[0];
    if (!startSpace) return false;
    const queue = [startSpace];
    visited.add(startSpace.spaceId);

    while (queue.length > 0) {
      const space = queue.shift();
      if (!space) break;

      // Find adjacent spaces within the structure
      for (const otherSpace of spaces) {
        if (
          !visited.has(otherSpace.spaceId) &&
          this.areSpacesAdjacent(space, otherSpace)
        ) {
          visited.add(otherSpace.spaceId);
          queue.push(otherSpace);
        }
      }
    }

    return visited.size === spaces.length;
  }

  /**
   * Check if two spaces are adjacent
   */
  private areSpacesAdjacent(space1: Space, space2: Space): boolean {
    const a = space1.boundingBox;
    const b = space2.boundingBox;
    const maxGap = 2; // allow small gaps for doors/passages

    // AABB proximity: two boxes are adjacent only when the separation gap on
    // EVERY axis is within maxGap (gap 0 = overlapping/touching). The previous
    // OR-of-single-axis test reported far-apart boxes as adjacent whenever any
    // one axis happened to line up, producing false connectivity.
    const gap = (minA: number, maxA: number, minB: number, maxB: number) =>
      Math.max(0, minA - maxB, minB - maxA);

    return (
      gap(a.min.x, a.max.x, b.min.x, b.max.x) <= maxGap &&
      gap(a.min.y, a.max.y, b.min.y, b.max.y) <= maxGap &&
      gap(a.min.z, a.max.z, b.min.z, b.max.z) <= maxGap
    );
  }

  /**
   * Validate separation between independent structures
   */
  validateStructureSeparation(
    structures: Structure[],
    allSpaces: Space[],
    allBlocks: BlockNode[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (let i = 0; i < structures.length; i++) {
      for (let j = i + 1; j < structures.length; j++) {
        const struct1 = structures[i];
        const struct2 = structures[j];
        if (!struct1 || !struct2) continue;

        const minDistance = this.calculateStructureDistance(
          struct1,
          struct2,
          allSpaces,
          allBlocks
        );

        if (minDistance < STRUCTURE_SEPARATION) {
          errors.push({
            code: "INSUFFICIENT_STRUCTURE_SEPARATION",
            message: `Structures ${struct1.structureId} and ${struct2.structureId} too close: ${minDistance} < ${STRUCTURE_SEPARATION}`,
            details: {
              structure1: struct1.structureId,
              structure2: struct2.structureId,
              distance: minDistance,
              required: STRUCTURE_SEPARATION,
            },
          });
        }
      }
    }

    return errors;
  }

  /**
   * Calculate minimum distance between two structures
   */
  private calculateStructureDistance(
    struct1: Structure,
    struct2: Structure,
    allSpaces: Space[],
    allBlocks: BlockNode[]
  ): number {
    // A block belongs to a structure when it is a member of one of that
    // structure's spaces. Resolve membership through Space.blockIds (the same
    // block<->space association used elsewhere in this file) rather than the
    // unset meta.createdBy field, which previously left both sets empty and
    // made this rule dead (always passing).
    const blockIdsForStructure = (struct: Structure): Set<string> => {
      const ids = new Set<string>();
      for (const space of allSpaces) {
        if (struct.spaceIds.includes(space.spaceId)) {
          for (const id of space.blockIds) ids.add(id);
        }
      }
      return ids;
    };
    const ids1 = blockIdsForStructure(struct1);
    const ids2 = blockIdsForStructure(struct2);
    const blocks1 = allBlocks.filter((b) => ids1.has(b.id));
    const blocks2 = allBlocks.filter((b) => ids2.has(b.id));

    let minDistance = Infinity;

    for (const block1 of blocks1) {
      for (const block2 of blocks2) {
        const distance = Math.sqrt(
          Math.pow(block1.p.x - block2.p.x, 2) +
            Math.pow(block1.p.y - block2.p.y, 2) +
            Math.pow(block1.p.z - block2.p.z, 2)
        );
        minDistance = Math.min(minDistance, distance);
      }
    }

    return minDistance;
  }

  /**
   * Not a validation rule — the partition inset is a renderer constant (visual surface
   * depth at block boundaries) with no game-logic constraints attached.
   * This method is intentionally empty.  It remains as an explicit record that
   * partition compliance was considered and ruled out as a validation concern.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validatePartitionCompliance(_blocks: BlockNode[]): ValidationError[] {
    return [];
  }
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Quick validation for a single block
 */
export function validateBlock(block: BlockNode): ValidationError[] {
  const errors: ValidationError[] = [];

  // Basic validation
  if (!block.id || block.id.trim() === "") {
    errors.push({
      code: "INVALID_BLOCK_ID",
      message: "Block must have a valid ID",
      blockId: block.id,
    });
  }

  if (!block.zoneId || block.zoneId.trim() === "") {
    errors.push({
      code: "INVALID_ZONE_ID",
      message: "Block must belong to a valid zone",
      blockId: block.id,
    });
  }

  return errors;
}

/**
 * Create a validation context for a zone
 */
export function createValidationContext(
  zoneId: string,
  blocks: BlockNode[],
  spaces: Space[]
): ValidationContext {
  return {
    zoneId,
    blockBudget: ZONE_BUDGETS.Central, // Default to central zone budget
    existingBlocks: blocks,
    existingSpaces: spaces,
  };
}
