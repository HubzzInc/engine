/**
 * Space Detection and Management
 * Implements connected component analysis to detect spaces from BlockNode graphs
 */

import type { BlockNode, Space, BoundingBox, Position3D, Position2D } from "./schemas";
import { createSpace } from "./schemas";
import { SpaceType, MIN_SPACE_HEIGHT, MIN_FLOOR_AREA } from "./constants";
import { BlockNodeGraph } from "./block-node";

// =============================================================================
// SPACE DETECTION ENGINE
// =============================================================================

/** Space detection configuration */
export interface SpaceDetectionConfig {
  /** Minimum height in blocks */
  minHeight: number;

  /** Minimum floor area in tiles */
  minFloorArea: number;

  /** Require enclosed spaces */
  requireEnclosure: boolean;
}

/** Space analysis result */
export interface SpaceAnalysis {
  /** Detected spaces */
  spaces: Space[];

  /** Orphaned blocks not part of any valid space */
  orphanedBlocks: string[];

  /** Analysis errors */
  errors: string[];
}

/**
 * Space detection engine
 */
export class SpaceDetectionEngine {
  private config: SpaceDetectionConfig;

  constructor(config: Partial<SpaceDetectionConfig> = {}) {
    this.config = {
      minHeight: config.minHeight ?? MIN_SPACE_HEIGHT,
      minFloorArea: config.minFloorArea ?? MIN_FLOOR_AREA,
      requireEnclosure: config.requireEnclosure ?? false,
    };
  }

  /**
   * Analyze a block graph and detect valid spaces
   */
  analyzeSpaces(graph: BlockNodeGraph, zoneId: string): SpaceAnalysis {
    const errors: string[] = [];
    const spaces: Space[] = [];
    const processedBlocks = new Set<string>();

    // Find connected components
    const components = graph.findConnectedComponents();

    for (const component of components) {
      try {
        const space = this.analyzeComponent(component, graph, zoneId);
        if (space) {
          spaces.push(space);
          component.forEach((blockId) => processedBlocks.add(blockId));
        }
      } catch (error) {
        errors.push(`Failed to analyze component: ${error}`);
      }
    }

    // Find orphaned blocks
    const allBlocks = graph.getAllBlocks().map((b) => b.id);
    const orphanedBlocks = allBlocks.filter((id) => !processedBlocks.has(id));

    return {
      spaces,
      orphanedBlocks,
      errors,
    };
  }

  /**
   * Analyze a connected component to determine if it forms a valid space
   */
  private analyzeComponent(
    blockIds: string[],
    graph: BlockNodeGraph,
    zoneId: string
  ): Space | null {
    if (blockIds.length === 0) return null;

    const blocks = blockIds
      .map((id) => graph.getBlock(id))
      .filter((b): b is BlockNode => Boolean(b));
    if (blocks.length === 0) return null;

    // Calculate spatial properties
    const boundingBox = this.calculateBoundingBox(blocks);
    const height = boundingBox.max.z - boundingBox.min.z + 1;
    const floorArea = this.calculateFloorArea(blocks);

    // Validate against minimum requirements
    if (height < this.config.minHeight) {
      return null; // Too short
    }

    if (floorArea < this.config.minFloorArea) {
      return null; // Too small
    }

    // Create space object
    const spaceId = `space_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const space = createSpace(spaceId, zoneId, this.determineSpaceType(blocks));

    // Populate space data
    space.blockIds = blockIds;
    space.boundingBox = boundingBox;
    space.interfaces = this.calculateInterfaces(blocks, boundingBox);

    return space;
  }

  /**
   * Calculate the bounding box for a set of blocks
   */
  private calculateBoundingBox(blocks: BlockNode[]): BoundingBox {
    if (blocks.length === 0) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
      };
    }

    const [first] = blocks;
    if (!first) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
      };
    }

    let minX = first.p.x,
      maxX = first.p.x;
    let minY = first.p.y,
      maxY = first.p.y;
    let minZ = first.p.z,
      maxZ = first.p.z;

    for (const block of blocks) {
      minX = Math.min(minX, block.p.x);
      maxX = Math.max(maxX, block.p.x);
      minY = Math.min(minY, block.p.y);
      maxY = Math.max(maxY, block.p.y);
      minZ = Math.min(minZ, block.p.z);
      maxZ = Math.max(maxZ, block.p.z);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  }

  /**
   * Calculate floor area by counting foundation blocks
   */
  private calculateFloorArea(blocks: BlockNode[]): number {
    const floorBlocks = blocks.filter(
      (block) => block.flags.foundation || this.isFloorBlock(block, blocks)
    );

    return floorBlocks.length;
  }

  /**
   * Determine if a block serves as a floor block
   */
  private isFloorBlock(block: BlockNode, allBlocks: BlockNode[]): boolean {
    // A block is a floor if it has no block below it within the space
    const belowPos = { x: block.p.x, y: block.p.y, z: block.p.z - 1 };
    return !allBlocks.some(
      (b) =>
        b.p.x === belowPos.x && b.p.y === belowPos.y && b.p.z === belowPos.z
    );
  }

  /**
   * Determine space type based on block characteristics
   */
  private determineSpaceType(blocks: BlockNode[]): SpaceType {
    // Simple heuristic - can be enhanced with more sophisticated logic
    const floorArea = this.calculateFloorArea(blocks);

    if (floorArea >= 100) {
      return SpaceType.Public; // Large spaces are public
    } else if (floorArea >= 50) {
      return SpaceType.Flex; // Medium spaces are flex
    } else {
      return SpaceType.Private; // Small spaces are private
    }
  }

  /**
   * Calculate interface footprints for space stacking
   */
  private calculateInterfaces(blocks: BlockNode[], boundingBox: BoundingBox) {
    const bottomFootprint = this.calculateFootprint(blocks, boundingBox.min.z);
    const topFootprint = this.calculateFootprint(blocks, boundingBox.max.z);

    return {
      bottom: { footprint: bottomFootprint },
      top: { footprint: topFootprint },
      elements: [], // Will be populated by interface detection
    };
  }

  /**
   * Calculate 2D footprint at a specific Z level
   */
  private calculateFootprint(blocks: BlockNode[], z: number): Position2D[] {
    const footprint: Position2D[] = [];

    for (const block of blocks) {
      if (block.p.z === z) {
        footprint.push({ x: block.p.x, y: block.p.y });
      }
    }

    return footprint;
  }
}

// =============================================================================
// SPACE UTILITIES
// =============================================================================

/**
 * Calculate space volume in cubic meters
 */
export function calculateSpaceVolume(space: Space): number {
  const bounds = space.boundingBox;
  const width = bounds.max.x - bounds.min.x + 1;
  const depth = bounds.max.y - bounds.min.y + 1;
  const height = bounds.max.z - bounds.min.z + 1;
  return width * depth * height;
}

/**
 * Calculate maximum occupancy for a space
 */
export function calculateMaxOccupancy(space: Space): number {
  const floorArea = space.interfaces.bottom.footprint.length;
  return Math.floor(floorArea / 4); // 4 tiles per user as per spec
}

/**
 * Check if a position is within a space's bounding box
 */
export function isPositionInSpace(position: Position3D, space: Space): boolean {
  const bounds = space.boundingBox;
  return (
    position.x >= bounds.min.x &&
    position.x <= bounds.max.x &&
    position.y >= bounds.min.y &&
    position.y <= bounds.max.y &&
    position.z >= bounds.min.z &&
    position.z <= bounds.max.z
  );
}

/**
 * Find the space that contains a given position
 */
export function findSpaceByPosition(
  position: Position3D,
  spaces: Space[]
): Space | null {
  for (const space of spaces) {
    if (isPositionInSpace(position, space)) {
      return space;
    }
  }
  return null;
}

/**
 * Calculate space metrics for analysis
 */
export function calculateSpaceMetrics(space: Space): {
  volume: number;
  floorArea: number;
  height: number;
  maxOccupancy: number;
  aspectRatio: number;
} {
  const bounds = space.boundingBox;
  const width = bounds.max.x - bounds.min.x + 1;
  const depth = bounds.max.y - bounds.min.y + 1;
  const height = bounds.max.z - bounds.min.z + 1;
  const volume = width * depth * height;
  const floorArea = space.interfaces.bottom.footprint.length;
  const maxOccupancy = calculateMaxOccupancy(space);
  const aspectRatio = Math.max(width, depth) / Math.min(width, depth);

  return {
    volume,
    floorArea,
    height,
    maxOccupancy,
    aspectRatio,
  };
}

// =============================================================================
// SPACE RELATIONSHIPS
// =============================================================================

/**
 * Find spaces that are adjacent (share interfaces)
 */
export function findAdjacentSpaces(
  targetSpace: Space,
  allSpaces: Space[]
): Space[] {
  const adjacent: Space[] = [];

  for (const space of allSpaces) {
    if (space.spaceId === targetSpace.spaceId) continue;

    if (areSpacesAdjacent(targetSpace, space)) {
      adjacent.push(space);
    }
  }

  return adjacent;
}

/**
 * Check if two spaces are adjacent
 */
export function areSpacesAdjacent(space1: Space, space2: Space): boolean {
  const bounds1 = space1.boundingBox;
  const bounds2 = space2.boundingBox;

  // Check if bounding boxes are touching but not overlapping
  const xAdjacent =
    bounds1.max.x + 1 === bounds2.min.x || bounds2.max.x + 1 === bounds1.min.x;

  const yAdjacent =
    bounds1.max.y + 1 === bounds2.min.y || bounds2.max.y + 1 === bounds1.min.y;

  const zAdjacent =
    bounds1.max.z + 1 === bounds2.min.z || bounds2.max.z + 1 === bounds1.min.z;

  const xOverlap =
    bounds1.min.x <= bounds2.max.x && bounds1.max.x >= bounds2.min.x;

  const yOverlap =
    bounds1.min.y <= bounds2.max.y && bounds1.max.y >= bounds2.min.y;

  const zOverlap =
    bounds1.min.z <= bounds2.max.z && bounds1.max.z >= bounds2.min.z;

  return (
    (xAdjacent && yOverlap && zOverlap) ||
    (yAdjacent && xOverlap && zOverlap) ||
    (zAdjacent && xOverlap && yOverlap)
  );
}

/**
 * Group spaces into structures (connected buildings)
 */
export function groupSpacesIntoStructures(spaces: Space[]): Space[][] {
  const structures: Space[][] = [];
  const visited = new Set<string>();

  for (const space of spaces) {
    if (visited.has(space.spaceId)) continue;

    const structure = findConnectedSpacesImpl(space, spaces, visited);
    if (structure.length > 0) {
      structures.push(structure);
    }
  }

  return structures;
}

/**
 * Find all spaces connected to a given space
 */
function findConnectedSpacesImpl(
  startSpace: Space,
  allSpaces: Space[],
  visited: Set<string>
): Space[] {
  const structure: Space[] = [];
  const queue: Space[] = [startSpace];

  while (queue.length > 0) {
    const space = queue.shift();
    if (!space) break;

    if (visited.has(space.spaceId)) continue;
    visited.add(space.spaceId);
    structure.push(space);

    // Find adjacent spaces
    const adjacent = findAdjacentSpaces(space, allSpaces);
    for (const adjSpace of adjacent) {
      if (!visited.has(adjSpace.spaceId)) {
        queue.push(adjSpace);
      }
    }
  }

  return structure;
}
