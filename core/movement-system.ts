/**
 * Movement System Implementation
 * Characters occupy space inside the cluster: they stand on the bottom face of the
 * lowest block node within the cluster instead of above the top surface.
 */

import { Position3D, BlockNode } from "./schemas";
import { CHARACTER_HEIGHT } from "./constants";
import { BlockNodeGraph } from "./block-node";

// =============================================================================
// MOVEMENT RULES & VALIDATION
// =============================================================================

/** Character movement state */
export interface CharacterMovement {
  /** Current character position */
  position: Position3D;

  /** Character height (default 1.5 blocks) */
  height: number;

  /** Block the character is currently standing on */
  standingOnBlockId: string | null;

  /** Whether character is currently in valid position */
  isValidPosition: boolean;

  /** Reason for invalid position (if any) */
  invalidReason?: string;
}

/** Movement validation result */
export interface MovementValidation {
  /** Whether movement is allowed */
  allowed: boolean;

  /** Target position after movement */
  targetPosition: Position3D;

  /** Block character will stand on after movement */
  targetBlockId: string | null;

  /** Reason for denied movement */
  deniedReason?: string;

  /** Suggested corrected position (if movement needs adjustment) */
  correctedPosition?: Position3D | undefined;
}

// =============================================================================
// MOVEMENT SYSTEM
// =============================================================================

/**
 * Manages character movement when players inhabit the interior of a block cluster
 * (standing on the bottom face of the containing block).
 */
export class MovementSystem {
  private graph: BlockNodeGraph;

  constructor(graph: BlockNodeGraph) {
    this.graph = graph;
  }

  /**
   * Validate if a character can move to a specific position
   */
  validateMovement(
    currentCharacter: CharacterMovement,
    targetPosition: Position3D
  ): MovementValidation {
    // Find the block that would contain the target position
    const targetBlockPosition = {
      x: Math.floor(targetPosition.x),
      y: Math.floor(targetPosition.y),
      z: Math.floor(targetPosition.z), // Character stands at bottom of the block volume
    };

    const targetBlock = this.graph.getBlockAt(targetBlockPosition);

    if (!targetBlock) {
      return {
        allowed: false,
        targetPosition,
        targetBlockId: null,
        deniedReason: "NO_BLOCK_UNDERNEATH",
        correctedPosition:
          this.findNearestValidPosition(targetPosition) || undefined,
      };
    }

    // Check if block has walkable top surface
    if (!targetBlock.flags.walkableTop) {
      return {
        allowed: false,
        targetPosition,
        targetBlockId: targetBlock.id,
        deniedReason: "BLOCK_NOT_WALKABLE",
      };
    }

    // Calculate character position (at the bottom of the block volume)
    const characterOnTopPosition: Position3D = {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetBlockPosition.z,
    };

    // Check headroom clearance (character height)
    const headroomClearance = this.checkHeadroomClearance(
      characterOnTopPosition,
      currentCharacter.height
    );

    if (!headroomClearance.hasEnoughClearance) {
      return {
        allowed: false,
        targetPosition: characterOnTopPosition,
        targetBlockId: targetBlock.id,
        deniedReason: "INSUFFICIENT_HEADROOM",
        correctedPosition: headroomClearance.suggestedPosition || undefined,
      };
    }

    return {
      allowed: true,
      targetPosition: characterOnTopPosition,
      targetBlockId: targetBlock.id,
    };
  }

  /**
   * Create a character at a valid spawn position
   */
  createCharacterAtSpawn(
    spawnPosition: Position3D,
    characterHeight = CHARACTER_HEIGHT
  ): CharacterMovement {
    // Find the spawn block
    const spawnBlockPosition = {
      x: Math.floor(spawnPosition.x),
      y: Math.floor(spawnPosition.y),
      z: Math.floor(spawnPosition.z),
    };

    const spawnBlock = this.graph.getBlockAt(spawnBlockPosition);

    if (!spawnBlock || !spawnBlock.flags.walkableTop) {
      throw new Error(
        `Invalid spawn position: no walkable block at (${spawnBlockPosition.x}, ${spawnBlockPosition.y}, ${spawnBlockPosition.z})`
      );
    }

    // Place character at the bottom of the spawn block volume
    const characterPosition: Position3D = {
      x: spawnPosition.x,
      y: spawnPosition.y,
      z: spawnBlockPosition.z,
    };

    // Validate headroom
    const headroomCheck = this.checkHeadroomClearance(
      characterPosition,
      characterHeight
    );
    if (!headroomCheck.hasEnoughClearance) {
      throw new Error(
        `Insufficient headroom at spawn position. Required: ${characterHeight}, Available: ${headroomCheck.availableHeight}`
      );
    }

    return {
      position: characterPosition,
      height: characterHeight,
      standingOnBlockId: spawnBlock.id,
      isValidPosition: true,
    };
  }

  /**
   * Move character to new position (enforcing movement rules)
   */
  moveCharacter(
    character: CharacterMovement,
    targetPosition: Position3D
  ): CharacterMovement {
    const validation = this.validateMovement(character, targetPosition);

    if (!validation.allowed) {
      // Movement denied - return character in same position
      return {
        ...character,
        isValidPosition: false,
        invalidReason: validation.deniedReason || "Movement denied",
      };
    }

    // Update character position
    return {
      ...character,
      position: validation.targetPosition,
      standingOnBlockId: validation.targetBlockId,
      isValidPosition: true,
    };
  }

  /**
   * Check headroom clearance above a position
   */
  private checkHeadroomClearance(
    position: Position3D,
    characterHeight: number
  ): {
    hasEnoughClearance: boolean;
    availableHeight: number;
    requiredHeight: number;
    suggestedPosition?: Position3D | undefined;
  } {
    const requiredHeight = characterHeight;
    let availableHeight = 0;

    // Check upward for obstacles, iterating each integer voxel cell the
    // avatar would occupy exactly once (from the feet cell up to the cell
    // containing the top of the required height).
    const firstCell = Math.floor(position.z);
    const lastCell = Math.ceil(position.z + requiredHeight) - 1;
    for (let cellZ = firstCell; cellZ <= lastCell; cellZ++) {
      const checkPosition = {
        x: Math.floor(position.x),
        y: Math.floor(position.y),
        z: cellZ,
      };

      const obstacleBlock = this.graph.getBlockAt(checkPosition);
      if (obstacleBlock) {
        // Found obstacle - calculate available height up to this cell
        availableHeight = cellZ - position.z;
        break;
      }
    }

    // If no obstacles found, assume we have enough clearance
    if (availableHeight === 0) {
      availableHeight = requiredHeight;
    }

    const hasEnoughClearance = availableHeight >= requiredHeight;

    return {
      hasEnoughClearance,
      availableHeight,
      requiredHeight,
      suggestedPosition: hasEnoughClearance
        ? undefined
        : this.findPositionWithClearance(position, requiredHeight) || undefined,
    };
  }

  /**
   * Find nearest valid position for character placement
   */
  private findNearestValidPosition(
    targetPosition: Position3D
  ): Position3D | undefined {
    const searchRadius = 3;

    for (let radius = 1; radius <= searchRadius; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          const candidateBlockPos = {
            x: Math.floor(targetPosition.x) + x,
            y: Math.floor(targetPosition.y) + y,
            z: Math.floor(targetPosition.z),
          };

          const candidateBlock = this.graph.getBlockAt(candidateBlockPos);
          if (candidateBlock && candidateBlock.flags.walkableTop) {
            return {
              x: candidateBlockPos.x + 0.5, // Center of block
              y: candidateBlockPos.y + 0.5,
              z: candidateBlockPos.z + 1.0, // On top
            };
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Find position with sufficient headroom clearance
   */
  private findPositionWithClearance(
    position: Position3D,
    requiredHeight: number
  ): Position3D | undefined {
    // Try moving down to find better clearance
    for (let offsetZ = 0; offsetZ <= 2; offsetZ++) {
      const testPosition = {
        ...position,
        z: position.z - offsetZ,
      };

      const clearanceCheck = this.checkHeadroomClearance(
        testPosition,
        requiredHeight
      );
      if (clearanceCheck.hasEnoughClearance) {
        return testPosition;
      }
    }

    return undefined;
  }

  /**
   * Get all valid spawn positions in current graph
   */
  getValidSpawnPositions(): Position3D[] {
    const spawnPositions: Position3D[] = [];

    for (const block of this.graph.getAllBlocks()) {
      if (block.flags.walkableTop) {
        const spawnPosition: Position3D = {
          x: block.p.x + 0.5, // Center of block
          y: block.p.y + 0.5,
          z: block.p.z + 1.0, // On top of block
        };

        // Check if this position has sufficient headroom
        const headroomCheck = this.checkHeadroomClearance(
          spawnPosition,
          CHARACTER_HEIGHT
        );
        if (headroomCheck.hasEnoughClearance) {
          spawnPositions.push(spawnPosition);
        }
      }
    }

    return spawnPositions;
  }
}

// =============================================================================
// MOVEMENT UTILITIES
// =============================================================================

/**
 * Check if a position is valid for character placement
 */
export function isValidCharacterPosition(
  position: Position3D,
  graph: BlockNodeGraph,
  characterHeight = CHARACTER_HEIGHT
): boolean {
  const movementSystem = new MovementSystem(graph);

  const testCharacter: CharacterMovement = {
    position: { x: 0, y: 0, z: 0 }, // Dummy current position
    height: characterHeight,
    standingOnBlockId: null,
    isValidPosition: false,
  };

  const validation = movementSystem.validateMovement(testCharacter, position);
  return validation.allowed;
}

/**
 * Get the block a character would be standing on at a position
 */
export function getStandingBlock(
  position: Position3D,
  graph: BlockNodeGraph
): BlockNode | null {
  const blockPosition = {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z) - 1, // Block below character position
  };

  return graph.getBlockAt(blockPosition) || null;
}
