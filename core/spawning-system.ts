/**
 * Player Spawning System
 * Handles URL-based spawning with drop-to-floor logic
 */

import { Position3D, BlockNode } from "./schemas";
import { CHARACTER_HEIGHT } from "./constants";
import { BlockNodeGraph } from "./block-node";
import { SpaceDetectionEngine } from "./space";
import { MovementSystem } from "./movement-system";

// =============================================================================
// SPAWNING TYPES & INTERFACES
// =============================================================================

/** URL spawn coordinates */
export interface SpawnURL {
  /** Zone coordinates (e.g., 0,0) */
  zoneCoordinates: { x: number; y: number };

  /** Block coordinates within zone (e.g., 5,6,-1) */
  blockCoordinates: { x: number; y: number; z: number };

  /** Original URL string */
  originalURL: string;
}

/** Spawn attempt result */
export interface SpawnResult {
  /** Whether spawn was successful */
  success: boolean;

  /** Final character position */
  finalPosition?: Position3D;

  /** Block the character is standing on */
  standingOnBlock?: BlockNode;

  /** Space the character spawned in */
  spaceId?: string | undefined;

  /** Distance dropped (if any) */
  dropDistance?: number;

  /** True only when the requested column had no standable floor below it. */
  relocated?: boolean;

  /** Reason for spawn failure */
  failureReason?: string;

  /** Suggested alternative spawn position */
  alternativePosition?: Position3D | undefined;
}

/** Drop-to-floor search result */
export interface DropToFloorResult {
  /** Floor block found */
  floorBlock?: BlockNode;

  /** Final position on floor */
  floorPosition?: Position3D;

  /** Distance dropped */
  dropDistance: number;

  /** Whether a valid floor was found */
  foundFloor: boolean;
}

// =============================================================================
// SPAWNING SYSTEM
// =============================================================================

/**
 * Manages player spawning from URL coordinates with drop-to-floor logic
 */
export class SpawningSystem {
  private graph: BlockNodeGraph;
  private spaceEngine: SpaceDetectionEngine;
  private movementSystem: MovementSystem;

  constructor(graph: BlockNodeGraph, spaceEngine: SpaceDetectionEngine) {
    this.graph = graph;
    this.spaceEngine = spaceEngine;
    this.movementSystem = new MovementSystem(graph);
  }

  /**
   * Parse spawn URL into coordinates
   * Format: hubzz.com/0,0/5,6,-1
   */
  parseSpawnURL(url: string): SpawnURL | null {
    try {
      // Extract coordinate portion from URL
      // Each coordinate is a signed integer: optional leading '-' then digits.
      // (The previous [0-9-]+ accepted interior/multiple hyphens like "1-2" or
      // "--1", which parseInt then mis-parsed.)
      const urlPattern =
        /hubzz\.com\/(-?\d+),(-?\d+)\/(-?\d+),(-?\d+),(-?\d+)/;
      const match = url.match(urlPattern);

      if (!match) {
        return null;
      }

      const [, zoneX, zoneY, blockX, blockY, blockZ] = match;

      return {
        zoneCoordinates: {
          x: parseInt(zoneX || '0', 10),
          y: parseInt(zoneY || '0', 10),
        },
        blockCoordinates: {
          x: parseInt(blockX || '0', 10),
          y: parseInt(blockY || '0', 10),
          z: parseInt(blockZ || '0', 10),
        },
        originalURL: url,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Attempt to spawn player at URL coordinates
   */
  spawnPlayerAtURL(
    url: string,
    characterHeight = CHARACTER_HEIGHT
  ): SpawnResult {
    const urlCoords = this.parseSpawnURL(url);

    if (!urlCoords) {
      return {
        success: false,
        failureReason: "INVALID_URL_FORMAT",
      };
    }

    return this.spawnPlayerAtCoordinates(
      urlCoords.blockCoordinates,
      characterHeight
    );
  }

  /**
   * Spawn player at specific block coordinates with drop-to-floor logic
   */
  spawnPlayerAtCoordinates(
    targetCoords: { x: number; y: number; z: number },
    characterHeight = CHARACTER_HEIGHT
  ): SpawnResult {
    // A URL may intentionally address empty air. Shape membership is therefore
    // established by the floor that catches the fall, never by an arbitrary
    // proximity radius around the requested point.
    let dropResult = this.dropToFloor(targetCoords, characterHeight);
    let relocated = false;

    // Preserve the requested column whenever it has a standable Up-face below.
    // Horizontal relocation is the fallback only when that column has none.
    if (!dropResult.foundFloor) {
      dropResult = this.findNearestFloorBelow(targetCoords, characterHeight);
      relocated = dropResult.foundFloor;
    }

    if (!dropResult.foundFloor) {
      return {
        success: false,
        failureReason: "NO_FLOOR_FOUND",
        alternativePosition:
          this.findNearestSpaceSpawn(targetCoords) || undefined,
      };
    }

    const { floorPosition, floorBlock } = dropResult;
    if (!floorPosition || !floorBlock) {
      return {
        success: false,
        failureReason: "CHARACTER_CREATION_FAILED",
        alternativePosition:
          this.findNearestSpaceSpawn(targetCoords) || undefined,
      };
    }

    const containingSpace = this.spaceEngine
      .analyzeSpaces(this.graph, floorBlock.zoneId)
      .spaces.find((space) => space.blockIds.includes(floorBlock.id));

    return {
      success: true,
      finalPosition: floorPosition,
      standingOnBlock: floorBlock,
      spaceId: containingSpace?.spaceId,
      dropDistance: dropResult.dropDistance,
      relocated,
    };
  }

  /**
   * Check if position is within any space (simplified version)
   * For now, assume any position with nearby blocks is within a "space"
   */
  private checkSpaceAtPosition(coords: { x: number; y: number; z: number }): {
    withinSpace: boolean;
    spaceId?: string;
  } {
    // Simplified check: look for blocks within a reasonable radius
    const searchRadius = 5;

    for (let x = coords.x - searchRadius; x <= coords.x + searchRadius; x++) {
      for (let y = coords.y - searchRadius; y <= coords.y + searchRadius; y++) {
        for (
          let z = Math.max(0, coords.z - searchRadius);
          z <= coords.z + searchRadius;
          z++
        ) {
          const nearbyBlock = this.graph.getBlockAt({ x, y, z });
          if (nearbyBlock) {
            return {
              withinSpace: true,
              spaceId: `space_around_${nearbyBlock.id}`,
            };
          }
        }
      }
    }

    return { withinSpace: false };
  }

  /**
   * Drop from target position to find closest floor tile
   */
  private dropToFloor(
    startCoords: { x: number; y: number; z: number },
    characterHeight: number
  ): DropToFloorResult {
    const x = Math.floor(startCoords.x);
    const y = Math.floor(startCoords.y);
    const blocks = this.graph.getAllBlocks();
    const minZ = blocks.reduce((min, block) => Math.min(min, block.p.z), Math.floor(startCoords.z));

    // A standable surface at z has solid support at z-1 and enough empty cells
    // above for the avatar. Search the complete column, top-down: the first hit
    // is the first discoverable floor during the fall. No arbitrary 20m cap.
    for (let surface = Math.floor(startCoords.z); surface >= minZ + 1; surface--) {
      const candidateBlock = this.graph.getBlockAt({ x, y, z: surface - 1 });
      if (!candidateBlock) continue;
      const floorPosition = { x: x + 0.5, y: y + 0.5, z: surface };
      if (!this.checkHeadroom(floorPosition, characterHeight)) continue;
      return {
        floorBlock: candidateBlock,
        floorPosition,
        dropDistance: Math.max(0, startCoords.z - surface),
        foundFloor: true,
      };
    }

    return {
      dropDistance: 0,
      foundFloor: false,
    };
  }

  /** Nearest-column fallback after the exact vertical ray has found no floor. */
  private findNearestFloorBelow(
    startCoords: { x: number; y: number; z: number },
    characterHeight: number
  ): DropToFloorResult {
    const homeX = Math.floor(startCoords.x);
    const homeY = Math.floor(startCoords.y);

    // Match hubzz_laws::drop_landing exactly: bounded 64×64 Zone-local
    // Chebyshev rings, dx-major then dy. Each candidate column still performs
    // the full top-down fall, so stacked floors choose the first surface below.
    for (let radius = 1; radius < 64; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = homeX + dx;
          const y = homeY + dy;
          if (x < 0 || x >= 64 || y < 0 || y >= 64) continue;
          const landing = this.dropToFloor({ x, y, z: startCoords.z }, characterHeight);
          if (landing.foundFloor) return landing;
        }
      }
    }
    return { dropDistance: 0, foundFloor: false };
  }

  /**
   * Check if there's sufficient headroom above a position
   */
  private checkHeadroom(
    position: Position3D,
    characterHeight: number
  ): boolean {
    // Check for obstacles above the character position
    for (
      let checkZ = position.z;
      checkZ < position.z + characterHeight;
      checkZ += 0.5
    ) {
      const checkPosition = {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: Math.floor(checkZ),
      };

      const obstacleBlock = this.graph.getBlockAt(checkPosition);
      if (obstacleBlock && checkZ > position.z + 0.1) {
        // Allow some tolerance
        return false; // Found obstacle
      }
    }

    return true; // Clear headroom
  }

  /**
   * Find nearest valid spawn position within any space
   */
  private findNearestSpaceSpawn(targetCoords: {
    x: number;
    y: number;
    z: number;
  }): Position3D | undefined {
    const validSpawns = this.movementSystem.getValidSpawnPositions();

    if (validSpawns.length === 0) {
      return undefined;
    }

    // Find closest spawn position
    let closestSpawn = validSpawns[0];
    if (!closestSpawn) return undefined;
    let closestDistance = this.calculateDistance3D(
      targetCoords,
      closestSpawn
    );

    for (const spawn of validSpawns) {
      const distance = this.calculateDistance3D(targetCoords, spawn);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSpawn = spawn;
      }
    }

    return closestSpawn;
  }

  /**
   * Calculate 3D distance between two positions
   */
  private calculateDistance3D(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number }
  ): number {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) +
        Math.pow(pos1.y - pos2.y, 2) +
        Math.pow(pos1.z - pos2.z, 2)
    );
  }

  /**
   * Generate spawn URL for a given position
   */
  generateSpawnURL(
    zoneCoords: { x: number; y: number },
    blockCoords: { x: number; y: number; z: number }
  ): string {
    return `hubzz.com/${zoneCoords.x},${zoneCoords.y}/${blockCoords.x},${blockCoords.y},${blockCoords.z}`;
  }

  /**
   * Validate spawn URL format
   */
  validateSpawnURL(url: string): boolean {
    return this.parseSpawnURL(url) !== null;
  }

  /**
   * Get spawn statistics for debugging
   */
  getSpawnStatistics(): {
    totalValidSpawns: number;
    spawnsBySpace: Map<string, number>;
    spawnsByHeight: Map<number, number>;
  } {
    const validSpawns = this.movementSystem.getValidSpawnPositions();

    const spawnsBySpace = new Map<string, number>();
    const spawnsByHeight = new Map<number, number>();

    // Count spawns by height
    validSpawns.forEach((spawn) => {
      const height = Math.floor(spawn.z);
      spawnsByHeight.set(height, (spawnsByHeight.get(height) || 0) + 1);

      // Find which space this spawn belongs to
      const spaceCheck = this.checkSpaceAtPosition({
        x: Math.floor(spawn.x),
        y: Math.floor(spawn.y),
        z: Math.floor(spawn.z) - 1, // Check block below spawn
      });

      if (spaceCheck.spaceId) {
        spawnsBySpace.set(
          spaceCheck.spaceId,
          (spawnsBySpace.get(spaceCheck.spaceId) || 0) + 1
        );
      }
    });

    return {
      totalValidSpawns: validSpawns.length,
      spawnsBySpace,
      spawnsByHeight,
    };
  }
}

// =============================================================================
// SPAWNING UTILITIES
// =============================================================================

/**
 * Quick spawn helper for testing
 */
export function quickSpawn(
  graph: BlockNodeGraph,
  spaceEngine: SpaceDetectionEngine,
  x: number,
  y: number,
  z: number
): SpawnResult {
  const spawningSystem = new SpawningSystem(graph, spaceEngine);
  return spawningSystem.spawnPlayerAtCoordinates({ x, y, z });
}

/**
 * Generate test spawn URLs
 */
export function generateTestSpawnURLs(
  graph: BlockNodeGraph,
  spaceEngine: SpaceDetectionEngine,
  count = 5
): string[] {
  const spawningSystem = new SpawningSystem(graph, spaceEngine);
  const movementSystem = new MovementSystem(graph);
  const validSpawns = movementSystem.getValidSpawnPositions();

  const urls: string[] = [];

  for (let i = 0; i < Math.min(count, validSpawns.length); i++) {
    const spawn = validSpawns[i];
    if (!spawn) continue;
    const blockCoords = {
      x: Math.floor(spawn.x),
      y: Math.floor(spawn.y),
      z: Math.floor(spawn.z) - 1, // Reference the block, not the spawn position above it
    };

    const url = spawningSystem.generateSpawnURL(
      { x: 0, y: 0 }, // Default zone
      blockCoords
    );

    urls.push(url);
  }

  return urls;
}
