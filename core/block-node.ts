/**
 * BlockNode Implementation - Core 2D-Net Graph System
 * Implements the fundamental 2D-Net primitive with neighbor links
 */

import { BlockNode, InterfaceElement, Position3D, createBlockNode, ValidationError } from "./schemas";
import {
  NeighborDir,
  OPPOSITE_DIR,
  DIR_TO_OFFSET,
  ALL_NEIGHBOR_DIRS,
} from "./constants";

// =============================================================================
// BLOCK NODE GRAPH OPERATIONS
// =============================================================================

/** Block node graph manager */
export class BlockNodeGraph {
  private nodes: Map<string, BlockNode> = new Map();
  private positionIndex: Map<string, string> = new Map();

  /**
   * Add a block node to the graph
   */
  addBlock(block: BlockNode): void {
    const posKey = this.positionToKey(block.p);

    // Check for existing block at position
    if (this.positionIndex.has(posKey)) {
      throw new Error(`Block already exists at position ${posKey}`);
    }

    this.nodes.set(block.id, block);
    this.positionIndex.set(posKey, block.id);
  }

  /**
   * Remove a block node from the graph
   */
  removeBlock(blockId: string): void {
    const block = this.nodes.get(blockId);
    if (!block) return;

    // Remove all neighbor links to this block
    this.unlinkAllNeighbors(blockId);

    // Remove from indices
    const posKey = this.positionToKey(block.p);
    this.nodes.delete(blockId);
    this.positionIndex.delete(posKey);
  }

  /**
   * Get a block by ID
   */
  getBlock(blockId: string): BlockNode | undefined {
    return this.nodes.get(blockId);
  }

  /**
   * Get a block by position
   */
  getBlockAt(position: Position3D): BlockNode | undefined {
    const posKey = this.positionToKey(position);
    const blockId = this.positionIndex.get(posKey);
    return blockId ? this.nodes.get(blockId) : undefined;
  }

  /**
   * Get all blocks in the graph
   */
  getAllBlocks(): BlockNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Link two blocks as neighbors
   */
  linkBlocks(blockId1: string, blockId2: string, direction: NeighborDir): void {
    const block1 = this.nodes.get(blockId1);
    const block2 = this.nodes.get(blockId2);

    if (!block1 || !block2) {
      throw new Error("Both blocks must exist to create link");
    }

    // Validate the link is geometrically correct
    const expectedPos = this.calculateNeighborPosition(block1.p, direction);
    if (!this.positionsEqual(expectedPos, block2.p)) {
      throw new Error(
        `Invalid neighbor link: ${blockId1} -> ${blockId2} in direction ${direction}`
      );
    }

    // Create bidirectional link
    block1.neighbors[direction] = blockId2;
    block2.neighbors[OPPOSITE_DIR[direction]] = blockId1;
  }

  /**
   * Unlink two blocks
   */
  unlinkBlocks(blockId1: string, blockId2: string): void {
    const block1 = this.nodes.get(blockId1);
    const block2 = this.nodes.get(blockId2);

    if (!block1 || !block2) return;

    // Find and remove the links
    for (const dir of ALL_NEIGHBOR_DIRS) {
      if (block1.neighbors[dir] === blockId2) {
        delete block1.neighbors[dir];
      }
      if (block2.neighbors[dir] === blockId1) {
        delete block2.neighbors[dir];
      }
    }
  }

  /**
   * Attach an interface element (Door/Window/Wall/DoorLink/...) to a block
   * face. Interfaces type an exposed boundary face, so an existing handshake
   * in the requested direction makes the placement invalid.
   */
  addInterface(blockId: string, element: InterfaceElement): boolean {
    const block = this.nodes.get(blockId);
    if (!block) return false;

    if (!Number.isFinite(element.width) || !Number.isFinite(element.height)) return false;
    if (element.width <= 0 || element.height <= 0) return false;
    if (element.width > 1.0 || element.height > 1.0) return false;
    if (block.neighbors[element.dir]) return false;

    block.interfaces.push(element);
    return true;
  }

  /**
   * Auto-link a block to its spatial neighbors
   */
  autoLinkBlock(blockId: string): void {
    const block = this.nodes.get(blockId);
    if (!block) return;

    for (const dir of ALL_NEIGHBOR_DIRS) {
      const neighborPos = this.calculateNeighborPosition(block.p, dir);
      const neighborBlock = this.getBlockAt(neighborPos);

      if (neighborBlock && !block.neighbors[dir]) {
        this.linkBlocks(blockId, neighborBlock.id, dir);
      }
    }
  }

  /**
   * Remove all neighbor links for a block
   */
  private unlinkAllNeighbors(blockId: string): void {
    const block = this.nodes.get(blockId);
    if (!block) return;

    // Unlink from all neighbors
    for (const dir of ALL_NEIGHBOR_DIRS) {
      const neighborId = block.neighbors[dir];
      if (neighborId) {
        this.unlinkBlocks(blockId, neighborId);
      }
    }
  }

  /**
   * Calculate expected neighbor position
   */
  private calculateNeighborPosition(
    position: Position3D,
    direction: NeighborDir
  ): Position3D {
    const offset = DIR_TO_OFFSET[direction];
    return {
      x: position.x + offset.x,
      y: position.y + offset.y,
      z: position.z + offset.z,
    };
  }

  /**
   * Convert position to string key for indexing
   */
  private positionToKey(position: Position3D): string {
    // Round to avoid floating point precision issues
    const x = Math.round(position.x * 1000) / 1000;
    const y = Math.round(position.y * 1000) / 1000;
    const z = Math.round(position.z * 1000) / 1000;
    return `${x},${y},${z}`;
  }

  /**
   * Check if two positions are equal
   */
  private positionsEqual(pos1: Position3D, pos2: Position3D): boolean {
    return pos1.x === pos2.x && pos1.y === pos2.y && pos1.z === pos2.z;
  }

  // =============================================================================
  // TRAVERSAL AND ANALYSIS
  // =============================================================================

  /**
   * Get all neighbors of a block
   */
  getNeighbors(
    blockId: string
  ): Array<{ direction: NeighborDir; block: BlockNode }> {
    const block = this.nodes.get(blockId);
    if (!block) return [];

    const neighbors: Array<{ direction: NeighborDir; block: BlockNode }> = [];

    for (const dir of ALL_NEIGHBOR_DIRS) {
      const neighborId = block.neighbors[dir];
      if (neighborId) {
        const neighborBlock = this.nodes.get(neighborId);
        if (neighborBlock) {
          neighbors.push({ direction: dir, block: neighborBlock });
        }
      }
    }

    return neighbors;
  }

  /**
   * Find connected components (spaces) using flood fill
   */
  findConnectedComponents(): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const blockId of this.nodes.keys()) {
      if (!visited.has(blockId)) {
        const component = this.floodFill(blockId, visited);
        if (component.length > 0) {
          components.push(component);
        }
      }
    }

    return components;
  }

  /**
   * Flood fill to find connected blocks
   */
  private floodFill(startBlockId: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const queue: string[] = [startBlockId];

    while (queue.length > 0) {
      const blockId = queue.shift();
      if (!blockId) continue;

      if (visited.has(blockId)) continue;
      visited.add(blockId);
      component.push(blockId);

      // Add all connected neighbors to queue
      const neighbors = this.getNeighbors(blockId);
      for (const { block } of neighbors) {
        if (!visited.has(block.id)) {
          queue.push(block.id);
        }
      }
    }

    return component;
  }

  /**
   * Check if two blocks are adjacent (touching)
   */
  areAdjacent(blockId1: string, blockId2: string): boolean {
    const block1 = this.nodes.get(blockId1);
    if (!block1) return false;

    // Check if block2 is in block1's neighbors
    for (const dir of ALL_NEIGHBOR_DIRS) {
      if (block1.neighbors[dir] === blockId2) {
        return true;
      }
    }

    return false;
  }

  // =============================================================================
  // VALIDATION
  // =============================================================================

  /**
   * Validate the entire graph for consistency
   */
  validateGraph(): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const block of this.nodes.values()) {
      // Validate neighbor link reciprocity
      for (const dir of ALL_NEIGHBOR_DIRS) {
        const neighborId = block.neighbors[dir];
        if (neighborId) {
          const neighbor = this.nodes.get(neighborId);
          if (!neighbor) {
            errors.push({
              code: "MISSING_NEIGHBOR",
              message: `Block ${block.id} links to non-existent neighbor ${neighborId}`,
              blockId: block.id,
            });
            continue;
          }

          // Check reciprocal link
          const oppositeDir = OPPOSITE_DIR[dir];
          if (neighbor.neighbors[oppositeDir] !== block.id) {
            errors.push({
              code: "NON_RECIPROCAL_LINK",
              message: `Non-reciprocal neighbor link between ${block.id} and ${neighborId}`,
              blockId: block.id,
            });
          }

          // Validate geometric consistency
          const expectedPos = this.calculateNeighborPosition(block.p, dir);
          if (!this.positionsEqual(expectedPos, neighbor.p)) {
            errors.push({
              code: "INVALID_GEOMETRY",
              message: `Geometric mismatch for neighbor link ${block.id} -> ${neighborId}`,
              blockId: block.id,
            });
          }
        }
      }

    }

    return errors;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get graph statistics
   */
  getStats(): {
    totalBlocks: number;
    totalLinks: number;
    connectedComponents: number;
    isolatedBlocks: number;
  } {
    const totalBlocks = this.nodes.size;
    let totalLinks = 0;
    let isolatedBlocks = 0;

    for (const block of this.nodes.values()) {
      const neighborCount = Object.values(block.neighbors).filter(
        (n) => n !== null
      ).length;
      totalLinks += neighborCount;
      if (neighborCount === 0) {
        isolatedBlocks++;
      }
    }

    // Each link is counted twice (bidirectional)
    totalLinks = totalLinks / 2;

    const connectedComponents = this.findConnectedComponents().length;

    return {
      totalBlocks,
      totalLinks,
      connectedComponents,
      isolatedBlocks,
    };
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.nodes.clear();
    this.positionIndex.clear();
  }
}

// =============================================================================
// BLOCK NODE UTILITIES
// =============================================================================

/**
 * Create a simple room structure
 */
export function createSimpleRoom(
  zoneId: string,
  origin: Position3D,
  width: number,
  depth: number,
  height: number
): BlockNodeGraph {
  const graph = new BlockNodeGraph();

  // Create floor blocks
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < depth; y++) {
      const position: Position3D = {
        x: origin.x + x,
        y: origin.y + y,
        z: origin.z,
      };

      const blockId = `floor_${x}_${y}`;
      const block = createBlockNode(blockId, zoneId, position);
      block.flags.foundation = true;

      graph.addBlock(block);
      graph.autoLinkBlock(blockId);
    }
  }

  // Create wall blocks
  for (let z = 1; z < height; z++) {
    // Front and back walls
    for (let x = 0; x < width; x++) {
      // Front wall
      const frontPos: Position3D = {
        x: origin.x + x,
        y: origin.y,
        z: origin.z + z,
      };
      const frontId = `wall_front_${x}_${z}`;
      const frontBlock = createBlockNode(frontId, zoneId, frontPos);
      graph.addBlock(frontBlock);
      graph.autoLinkBlock(frontId);

      // Back wall
      const backPos: Position3D = {
        x: origin.x + x,
        y: origin.y + depth - 1,
        z: origin.z + z,
      };
      const backId = `wall_back_${x}_${z}`;
      const backBlock = createBlockNode(backId, zoneId, backPos);
      graph.addBlock(backBlock);
      graph.autoLinkBlock(backId);
    }

    // Left and right walls (excluding corners already placed)
    for (let y = 1; y < depth - 1; y++) {
      // Left wall
      const leftPos: Position3D = {
        x: origin.x,
        y: origin.y + y,
        z: origin.z + z,
      };
      const leftId = `wall_left_${y}_${z}`;
      const leftBlock = createBlockNode(leftId, zoneId, leftPos);
      graph.addBlock(leftBlock);
      graph.autoLinkBlock(leftId);

      // Right wall
      const rightPos: Position3D = {
        x: origin.x + width - 1,
        y: origin.y + y,
        z: origin.z + z,
      };
      const rightId = `wall_right_${y}_${z}`;
      const rightBlock = createBlockNode(rightId, zoneId, rightPos);
      graph.addBlock(rightBlock);
      graph.autoLinkBlock(rightId);
    }
  }

  return graph;
}
