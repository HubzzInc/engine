/**
 * Hollow Space Detection System
 * Detects both solid structures AND hollow interior spaces within those structures
 */

import type { BlockNode, Space, BoundingBox, Position3D } from "./schemas";
import { createSpace } from "./schemas";
import { ALLOWED_HEIGHTS, SpaceType, ZONE_GRID_SIZE } from "./constants";
import { BlockNodeGraph } from "./block-node";

// =============================================================================
// HOLLOW SPACE DETECTION INTERFACES
// =============================================================================

/** Analysis of both solid and hollow spaces */
export interface HollowSpaceAnalysis {
  /** Solid structures (connected blocks) */
  solidSpaces: Space[];

  /** Hollow interior spaces (air pockets within structures) */
  hollowSpaces: Space[];

  /** Out-of-bounds areas (outside zone boundaries) */
  outOfBoundsRegions: OutOfBoundsRegion[];

  /** Orphaned blocks not part of any valid space */
  orphanedBlocks: string[];

  /** Analysis errors */
  errors: string[];
}

/** Out-of-bounds region definition */
export interface OutOfBoundsRegion {
  /** Region identifier */
  regionId: string;

  /** Bounding box of the region */
  boundingBox: BoundingBox;

  /** Voxel positions that are out-of-bounds */
  voxelPositions: Position3D[];

  /** Reason for being out-of-bounds */
  reason: "ZONE_BOUNDARY" | "NEGATIVE_COORDINATES" | "HEIGHT_LIMIT" | "CUSTOM";

  /** Severity level */
  severity: "WARNING" | "ERROR";
}

/** Hollow space detection configuration */
export interface HollowDetectionConfig {
  /** Zone boundaries (64x64 grid) */
  zoneBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };

  /** Minimum hollow space size to detect */
  minHollowVolume: number;

  /** Maximum analysis depth (to prevent infinite recursion) */
  maxAnalysisDepth: number;

  /** Whether to detect micro-cavities */
  detectMicroCavities: boolean;
}

// =============================================================================
// ENHANCED SPACE DETECTION ENGINE
// =============================================================================

/**
 * Enhanced space detection that handles both solid and hollow spaces
 */
export class HollowSpaceDetectionEngine {
  private config: HollowDetectionConfig;

  constructor(config: Partial<HollowDetectionConfig> = {}) {
    this.config = {
      zoneBounds: {
        minX: 0,
        maxX: ZONE_GRID_SIZE - 1,
        minY: 0,
        maxY: ZONE_GRID_SIZE - 1,
        minZ: 0,
        // The vertical law: the tallest legal stack is the top of
        // ALLOWED_HEIGHTS (2,4,6,8), so the highest legal cell index is that
        // minus one. Replaces a bare `100` that had no canon source.
        maxZ: Math.max(...ALLOWED_HEIGHTS) - 1,
      },
      minHollowVolume: 8, // At least 2x2x2 hollow space
      maxAnalysisDepth: 1000,
      detectMicroCavities: false,
      ...config,
    };
  }

  /**
   * Analyze both solid structures and hollow spaces within them
   */
  analyzeAllSpaces(graph: BlockNodeGraph, zoneId: string): HollowSpaceAnalysis {
    const errors: string[] = [];

    // Step 1: Find solid structures (existing logic)
    const solidComponents = graph.findConnectedComponents();
    const solidSpaces: Space[] = [];
    const processedBlocks = new Set<string>();

    for (const component of solidComponents) {
      try {
        const space = this.createSpaceFromComponent(
          component,
          graph,
          zoneId,
          "solid"
        );
        if (space) {
          solidSpaces.push(space);
          component.forEach((blockId) => processedBlocks.add(blockId));
        }
      } catch (error) {
        errors.push(`Failed to analyze solid component: ${error}`);
      }
    }

    // Step 2: Find hollow spaces within structures
    const hollowSpaces = this.detectHollowSpaces(graph, solidSpaces, zoneId);

    // Step 3: Detect out-of-bounds regions
    const outOfBoundsRegions = this.detectOutOfBoundsRegions(graph);

    // Step 4: Find orphaned blocks
    const allBlocks = graph.getAllBlocks().map((b) => b.id);
    const orphanedBlocks = allBlocks.filter((id) => !processedBlocks.has(id));

    return {
      solidSpaces,
      hollowSpaces,
      outOfBoundsRegions,
      orphanedBlocks,
      errors,
    };
  }

  /**
   * Detect hollow interior spaces within solid structures
   */
  private detectHollowSpaces(
    graph: BlockNodeGraph,
    solidSpaces: Space[],
    zoneId: string
  ): Space[] {
    const hollowSpaces: Space[] = [];

    for (const solidSpace of solidSpaces) {
      try {
        const hollowsInThisSpace = this.findHollowsWithinSpace(
          graph,
          solidSpace,
          zoneId
        );
        hollowSpaces.push(...hollowsInThisSpace);
      } catch (error) {
        console.warn(
          `Failed to analyze hollows in space ${solidSpace.spaceId}:`,
          error
        );
      }
    }

    return hollowSpaces;
  }

  /**
   * Find hollow spaces within a single solid structure
   */
  private findHollowsWithinSpace(
    graph: BlockNodeGraph,
    solidSpace: Space,
    zoneId: string
  ): Space[] {
    const hollowSpaces: Space[] = [];
    const bounds = solidSpace.boundingBox;
    const solidBlockPositions = new Set<string>();

    // Build set of solid block positions
    for (const blockId of solidSpace.blockIds) {
      const block = graph.getBlock(blockId);
      if (block) {
        solidBlockPositions.add(this.positionToKey(block.p));
      }
    }

    const visitedHollowPositions = new Set<string>();

    // Scan interior for hollow regions
    for (let x = bounds.min.x + 1; x < bounds.max.x; x++) {
      for (let y = bounds.min.y + 1; y < bounds.max.y; y++) {
        for (let z = bounds.min.z + 1; z < bounds.max.z; z++) {
          const position = { x, y, z };
          const posKey = this.positionToKey(position);

          // Skip if this position has a block or already processed
          if (
            solidBlockPositions.has(posKey) ||
            visitedHollowPositions.has(posKey)
          ) {
            continue;
          }

          // Found potential hollow space - flood fill to find its extent
          const hollowRegion = this.floodFillHollow(
            position,
            solidBlockPositions,
            visitedHollowPositions,
            bounds
          );

          if (hollowRegion.length >= this.config.minHollowVolume) {
            const hollowSpace = this.createHollowSpace(
              hollowRegion,
              solidSpace,
              zoneId
            );
            if (hollowSpace) {
              hollowSpaces.push(hollowSpace);
            }
          }
        }
      }
    }

    return hollowSpaces;
  }

  /**
   * Flood fill to find connected hollow region
   */
  private floodFillHollow(
    startPosition: Position3D,
    solidBlockPositions: Set<string>,
    visitedHollowPositions: Set<string>,
    bounds: BoundingBox
  ): Position3D[] {
    const hollowRegion: Position3D[] = [];
    const queue: Position3D[] = [startPosition];
    const localVisited = new Set<string>();

    while (
      queue.length > 0 &&
      hollowRegion.length < this.config.maxAnalysisDepth
    ) {
      const position = queue.shift();
      if (!position) break;
      const posKey = this.positionToKey(position);

      // Skip if already processed or out of bounds
      if (
        localVisited.has(posKey) ||
        visitedHollowPositions.has(posKey) ||
        !this.isWithinBounds(position, bounds)
      ) {
        continue;
      }

      // Skip if there's a solid block here
      if (solidBlockPositions.has(posKey)) {
        continue;
      }

      localVisited.add(posKey);
      visitedHollowPositions.add(posKey);
      hollowRegion.push(position);

      // Add neighbors to queue
      const neighbors = this.getNeighborPositions(position);
      for (const neighbor of neighbors) {
        if (!localVisited.has(this.positionToKey(neighbor))) {
          queue.push(neighbor);
        }
      }
    }

    return hollowRegion;
  }

  /**
   * Create a hollow space object from hollow region positions
   */
  private createHollowSpace(
    hollowRegion: Position3D[],
    parentSolidSpace: Space,
    zoneId: string
  ): Space | null {
    if (hollowRegion.length === 0) return null;

    const spaceId = `hollow_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const hollowSpace = createSpace(spaceId, zoneId, SpaceType.Public);

    // Calculate bounding box for hollow space
    hollowSpace.boundingBox =
      this.calculateBoundingBoxFromPositions(hollowRegion);

    // Create virtual block IDs for hollow positions (for consistency)
    hollowSpace.blockIds = hollowRegion.map(
      (pos, i) => `hollow_${spaceId}_${i}`
    );

    // Set space properties
    hollowSpace.type = SpaceType.Public; // Hollow spaces are navigable
    hollowSpace.interfaces = {
      bottom: {
        footprint: this.calculateFootprint(
          hollowRegion,
          hollowSpace.boundingBox.min.z
        ),
      },
      top: {
        footprint: this.calculateFootprint(
          hollowRegion,
          hollowSpace.boundingBox.max.z
        ),
      },
      elements: [],
    };

    return hollowSpace;
  }

  /**
   * Detect out-of-bounds regions
   */
  private detectOutOfBoundsRegions(graph: BlockNodeGraph): OutOfBoundsRegion[] {
    const outOfBoundsRegions: OutOfBoundsRegion[] = [];
    const bounds = this.config.zoneBounds;

    const violatingBlocks: Position3D[] = [];

    for (const block of graph.getAllBlocks()) {
      const pos = block.p;

      if (
        pos.x < bounds.minX ||
        pos.x > bounds.maxX ||
        pos.y < bounds.minY ||
        pos.y > bounds.maxY ||
        pos.z < bounds.minZ ||
        pos.z > bounds.maxZ
      ) {
        violatingBlocks.push(pos);
      }
    }

    if (violatingBlocks.length > 0) {
      outOfBoundsRegions.push({
        regionId: `oob_zone_${Date.now()}`,
        boundingBox: this.calculateBoundingBoxFromPositions(violatingBlocks),
        voxelPositions: violatingBlocks,
        reason: "ZONE_BOUNDARY",
        severity: "ERROR",
      });
    }

    return outOfBoundsRegions;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private createSpaceFromComponent(
    component: string[],
    graph: BlockNodeGraph,
    zoneId: string,
    type: "solid" | "hollow"
  ): Space | null {
    if (component.length === 0) return null;

    const blocks = component
      .map((id) => graph.getBlock(id))
      .filter((b): b is BlockNode => Boolean(b));
    if (blocks.length === 0) return null;

    const spaceId = `${type}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const space = createSpace(spaceId, zoneId, SpaceType.Public);

    space.blockIds = component;
    space.boundingBox = this.calculateBoundingBox(blocks);

    return space;
  }

  private calculateBoundingBox(blocks: BlockNode[]): BoundingBox {
    if (blocks.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    const [first] = blocks;
    if (!first) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
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

  private calculateBoundingBoxFromPositions(
    positions: Position3D[]
  ): BoundingBox {
    if (positions.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    const [first] = positions;
    if (!first) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }
    let minX = first.x,
      maxX = first.x;
    let minY = first.y,
      maxY = first.y;
    let minZ = first.z,
      maxZ = first.z;

    for (const pos of positions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  }

  private calculateFootprint(
    positions: Position3D[],
    z: number
  ): Array<{ x: number; y: number }> {
    const footprint: Array<{ x: number; y: number }> = [];

    for (const pos of positions) {
      if (pos.z === z) {
        footprint.push({ x: pos.x, y: pos.y });
      }
    }

    return footprint;
  }

  private positionToKey(position: Position3D): string {
    return `${position.x},${position.y},${position.z}`;
  }

  private getNeighborPositions(position: Position3D): Position3D[] {
    return [
      { x: position.x + 1, y: position.y, z: position.z }, // East
      { x: position.x - 1, y: position.y, z: position.z }, // West
      { x: position.x, y: position.y + 1, z: position.z }, // North
      { x: position.x, y: position.y - 1, z: position.z }, // South
      { x: position.x, y: position.y, z: position.z + 1 }, // Up
      { x: position.x, y: position.y, z: position.z - 1 }, // Down
    ];
  }

  private isWithinBounds(position: Position3D, bounds: BoundingBox): boolean {
    return (
      position.x >= bounds.min.x &&
      position.x <= bounds.max.x &&
      position.y >= bounds.min.y &&
      position.y <= bounds.max.y &&
      position.z >= bounds.min.z &&
      position.z <= bounds.max.z
    );
  }
}
