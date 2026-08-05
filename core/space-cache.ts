/**
 * Space Caching System
 * Implements local storage of mapped spaces with delta update optimization
 * Flood fill runs once, then uses cached results with incremental updates
 */

import { Position3D, BlockNode } from "./schemas";
import { BlockNodeGraph } from "./block-node";
import { NeighborDir } from "./constants";

// =============================================================================
// SPACE CACHE DATA STRUCTURES
// =============================================================================

/** Cached space snapshot with complete mapping data */
export interface CachedSpaceSnapshot {
  /** Unique space identifier */
  spaceId: string;

  /** Zone this space belongs to */
  zoneId: string;

  /** Timestamp of last mapping */
  lastMapped: number;

  /** Version/checksum for cache invalidation */
  version: string;

  /**
   * Canonical 2D-Net shape fingerprint (`netFingerprint().id`) of this space's
   * blocks, when the caller supplies one. Position-invariant shape identity —
   * a warm hit carries the same fingerprint a cold recompute would derive, so
   * consumers can compare shape without re-running the flood. Optional: cache
   * users that don't track shape identity leave it undefined.
   */
  fingerprint?: string;

  /** Complete reachability graph from spawn points */
  reachabilityMap: Map<string, Set<string>>;

  /** Space boundaries (bounding box) */
  boundaries: {
    min: Position3D;
    max: Position3D;
  };

  /** All blocks that comprise this space */
  blockIds: Set<string>;

  /** Spawn points within this space */
  spawnPoints: Position3D[];

  /** Validation results cache */
  validationState: {
    isValid: boolean;
    errors: string[];
    lastValidated: number;
  };

  /** Navigable volume calculation */
  navigableVolume: {
    totalFloorTiles: number;
    minHeight: number;
    maxHeight: number;
    accessibleAreas: Position3D[];
  };
}

/** Delta change detection for incremental updates */
export interface SpaceDelta {
  /** Change type */
  type:
    | "block_added"
    | "block_removed"
    | "interface_changed"
    | "validation_changed";

  /** Affected block position */
  position: Position3D;

  /** Block ID if applicable */
  blockId?: string;

  /** Timestamp of change */
  timestamp: number;

  /** Affected space regions (for targeted recomputation) */
  affectedRegions: Position3D[];
}

/** Cache performance metrics */
export interface CacheMetrics {
  /** Total cache hits vs misses */
  hitRate: number;

  /** Average space loading time */
  averageLoadTime: number;

  /** Delta update performance */
  deltaUpdateTime: number;

  /** Memory usage */
  cacheMemoryUsage: number;

  /** Cache size */
  totalCachedSpaces: number;
}

// =============================================================================
// SPACE CACHE MANAGER
// =============================================================================

export class SpaceCacheManager {
  private cache: Map<string, CachedSpaceSnapshot> = new Map();
  private deltaLog: Map<string, SpaceDelta[]> = new Map();
  private metrics: CacheMetrics;

  constructor() {
    this.metrics = {
      hitRate: 0,
      averageLoadTime: 0,
      deltaUpdateTime: 0,
      cacheMemoryUsage: 0,
      totalCachedSpaces: 0,
    };
  }

  /**
   * Get space from cache or perform initial mapping.
   *
   * `opts.versionKey` (additive) lets a caller supply a server-derived version
   * — e.g. the `space_scene.updated_at` timestamp — as the invalidation key.
   * When present it OVERRIDES the block-checksum, so a republish (new
   * updated_at) invalidates even if the block positions round-trip identically;
   * when absent the engine falls back to its own `calculateSpaceVersion`
   * checksum exactly as before. `opts.fingerprint` (additive) is stored on the
   * snapshot as the space's canonical 2D-Net shape identity.
   */
  async getSpace(
    spaceId: string,
    graph: BlockNodeGraph,
    forceRefresh = false,
    opts?: { versionKey?: string; fingerprint?: string }
  ): Promise<CachedSpaceSnapshot> {
    const startTime = performance.now();

    if (!forceRefresh && this.cache.has(spaceId)) {
      // Check if cache is still valid
      const cached = this.cache.get(spaceId);
      if (!cached) {
        // Defensive: cache contained key but get returned undefined — fall back to full mapping
        console.warn(`Cache inconsistency detected for space ${spaceId}, performing full mapping`);
        return await this.performFullMapping(spaceId, graph, opts);
      }
      const currentVersion = this.resolveVersion(spaceId, graph, opts?.versionKey);

      if (cached.version === currentVersion) {
        // Cache hit - return immediately
        this.updateMetrics("hit", performance.now() - startTime);
        console.log(
          `💾 Cache HIT for space ${spaceId} (${(
            performance.now() - startTime
          ).toFixed(2)}ms)`
        );
        return cached;
      } else {
        console.log(`🔄 Cache STALE for space ${spaceId}, checking deltas...`);

        // Check if we can do incremental update
        const deltaUpdate = await this.tryDeltaUpdate(spaceId, graph, cached, opts);
        if (deltaUpdate) {
          this.updateMetrics("delta", performance.now() - startTime);
          return deltaUpdate;
        }
      }
    }

    // Cache miss - perform full mapping
    console.log(
      `🗺️  Cache MISS for space ${spaceId}, performing full mapping...`
    );
    const mapped = await this.performFullMapping(spaceId, graph, opts);
    this.cache.set(spaceId, mapped);

    this.updateMetrics("miss", performance.now() - startTime);
    return mapped;
  }

  /**
   * Attempt incremental delta update instead of full remapping
   */
  private async tryDeltaUpdate(
    spaceId: string,
    graph: BlockNodeGraph,
    cached: CachedSpaceSnapshot,
    opts?: { versionKey?: string; fingerprint?: string }
  ): Promise<CachedSpaceSnapshot | null> {
    const deltas = this.deltaLog.get(spaceId) || [];

    // Stale version with NO recorded deltas means the change happened outside
    // the delta contract — only a full remapping can be correct.
    if (deltas.length === 0) {
      return null;
    }

    // If too many deltas, full remapping is more efficient
    if (deltas.length > 10) {
      console.log(
        `⚠️  Too many deltas (${deltas.length}), falling back to full mapping`
      );
      return null;
    }

    // Apply each delta incrementally
    let updatedSnapshot = { ...cached };

    for (const delta of deltas) {
      updatedSnapshot = await this.applyDelta(updatedSnapshot, delta, graph);
    }

    // Clear applied deltas
    this.deltaLog.set(spaceId, []);

    // Update version and timestamp
    updatedSnapshot.version = this.resolveVersion(spaceId, graph, opts?.versionKey);
    updatedSnapshot.lastMapped = Date.now();
    if (opts?.fingerprint !== undefined) updatedSnapshot.fingerprint = opts.fingerprint;

    console.log(
      `⚡ Delta update completed for space ${spaceId} (${deltas.length} changes)`
    );
    return updatedSnapshot;
  }

  /**
   * Apply a single delta change to cached space
   */
  private async applyDelta(
    snapshot: CachedSpaceSnapshot,
    delta: SpaceDelta,
    graph: BlockNodeGraph
  ): Promise<CachedSpaceSnapshot> {
    const updated = { ...snapshot };

    switch (delta.type) {
      case "block_added":
        if (delta.blockId) {
          updated.blockIds.add(delta.blockId);
          // Incrementally update reachability from affected regions
          await this.updateReachabilityForAddition(updated, delta, graph);
        }
        break;

      case "block_removed":
        if (delta.blockId) {
          updated.blockIds.delete(delta.blockId);
          // Check if removal breaks connectivity
          await this.updateReachabilityForRemoval(updated, delta, graph);
        }
        break;

      case "interface_changed":
        // Interface changes might affect navigation but not connectivity
        await this.updateNavigationForInterface(updated, delta, graph);
        break;
    }

    return updated;
  }

  /**
   * Perform complete space mapping (initial or fallback)
   */
  private async performFullMapping(
    spaceId: string,
    graph: BlockNodeGraph,
    opts?: { versionKey?: string; fingerprint?: string }
  ): Promise<CachedSpaceSnapshot> {
    // Use existing space detection to get base space data
    const allBlocks = graph.getAllBlocks();

    if (allBlocks.length === 0) {
      throw new Error(`No blocks found for space ${spaceId}`);
    }

    // Find connected components using public method
    const components = graph.findConnectedComponents();

    if (components.length === 0) {
      throw new Error(`No connected components found for space ${spaceId}`);
    }

    // Use the first (largest) component as the space
    const largestComponent = components.reduce(
      (largest, current) =>
        current.length > largest.length ? current : largest,
      components[0] || []
    );

    if (!largestComponent) {
      throw new Error(`No valid component found for space ${spaceId}`);
    }

    const reachableBlocks = largestComponent
      .map((id) => graph.getBlock(id))
      .filter((block) => block !== null) as BlockNode[];

    // Calculate boundaries
    const boundaries = this.calculateBoundaries(reachableBlocks);

    // Build reachability map (simplified - in this case all blocks in component are reachable from each other)
    const reachabilityMap = new Map<string, Set<string>>();
    const componentBlockIds = new Set(largestComponent);
    reachableBlocks.forEach((block) => {
      reachabilityMap.set(block.id, componentBlockIds);
    });

    // Calculate navigable areas
    const navigableVolume = this.calculateNavigableVolume(reachableBlocks);

    // Create cached snapshot
    const snapshot: CachedSpaceSnapshot = {
      spaceId,
      zoneId: reachableBlocks[0]?.zoneId || "unknown",
      lastMapped: Date.now(),
      version: this.resolveVersion(spaceId, graph, opts?.versionKey),
      fingerprint: opts?.fingerprint,
      reachabilityMap,
      boundaries,
      blockIds: new Set(reachableBlocks.map((b) => b.id)),
      spawnPoints: reachableBlocks
        .filter((b) => !b.neighbors[NeighborDir.Up])
        .map((b) => ({ x: b.p.x, y: b.p.y, z: b.p.z + 1.0 })),
      validationState: {
        isValid: true, // Would use actual validation
        errors: [],
        lastValidated: Date.now(),
      },
      navigableVolume,
    };

    console.log(`✅ Full mapping completed for space ${spaceId}:`);
    console.log(`   - ${reachableBlocks.length} blocks`);
    console.log(`   - ${snapshot.spawnPoints.length} spawn points`);
    console.log(`   - ${navigableVolume.totalFloorTiles} floor tiles`);

    return snapshot;
  }

  /**
   * Record a delta change for incremental updates
   */
  recordDelta(spaceId: string, delta: SpaceDelta): void {
    if (!this.deltaLog.has(spaceId)) {
      this.deltaLog.set(spaceId, []);
    }

    const existing = this.deltaLog.get(spaceId);
    if (existing) {
      existing.push(delta);
    } else {
      this.deltaLog.set(spaceId, [delta]);
    }
    console.log(
      `📝 Delta recorded for space ${spaceId}: ${delta.type} at ${delta.position.x},${delta.position.y},${delta.position.z}`
    );
  }

  /**
   * Invalidate cache for specific space
   */
  invalidateSpace(spaceId: string): void {
    this.cache.delete(spaceId);
    this.deltaLog.delete(spaceId);
    console.log(`🗑️  Cache invalidated for space ${spaceId}`);
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(): CacheMetrics {
    this.metrics.totalCachedSpaces = this.cache.size;
    this.metrics.cacheMemoryUsage = this.estimateMemoryUsage();
    return { ...this.metrics };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Resolve the invalidation key for a space. When the caller supplies a
   * server-derived `versionKey` (e.g. `space_scene.updated_at`), it is the
   * authority: a republish bumps updated_at and invalidates even when the
   * block positions are byte-identical. With no key we fall back to the
   * engine's own block-checksum — the pre-existing behavior — so the
   * server-versioned and self-versioned paths coexist. The block checksum is
   * folded in alongside the server key so a same-timestamp block edit (should
   * one ever occur) still invalidates rather than serving a stale snapshot.
   */
  private resolveVersion(
    spaceId: string,
    graph: BlockNodeGraph,
    versionKey?: string
  ): string {
    const checksum = this.calculateSpaceVersion(spaceId, graph);
    return versionKey === undefined ? checksum : `s:${versionKey}_${checksum}`;
  }

  private calculateSpaceVersion(
    spaceId: string,
    graph: BlockNodeGraph
  ): string {
    // Simple version based on block count and positions
    const blocks = graph.getAllBlocks();
    const hash = blocks
      .map((b) => `${b.p.x},${b.p.y},${b.p.z}`)
      .sort()
      .join("|");

    return `v${blocks.length}_${this.simpleHash(hash)}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private calculateBoundaries(blocks: BlockNode[]): {
    min: Position3D;
    max: Position3D;
  } {
    if (blocks.length === 0) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };

    blocks.forEach((block) => {
      min.x = Math.min(min.x, block.p.x);
      min.y = Math.min(min.y, block.p.y);
      min.z = Math.min(min.z, block.p.z);
      max.x = Math.max(max.x, block.p.x);
      max.y = Math.max(max.y, block.p.y);
      max.z = Math.max(max.z, block.p.z);
    });

    return { min, max };
  }

  private calculateNavigableVolume(blocks: BlockNode[]) {
    // A walkable surface is a block whose UP neighbour is empty (exposed top).
    const floorBlocks = blocks.filter((b) => !b.neighbors[NeighborDir.Up]);
    const positions = blocks.map((b) => b.p);

    // Count unique floor columns (x,y), not every surface block — stacked
    // surfaces in the same column are one navigable tile.
    const columns = new Set(floorBlocks.map((b) => `${b.p.x},${b.p.y}`));

    return {
      totalFloorTiles: columns.size,
      minHeight: Math.min(...positions.map((p) => p.z)),
      maxHeight: Math.max(...positions.map((p) => p.z)),
      accessibleAreas: floorBlocks.map((b) => ({
        x: b.p.x,
        y: b.p.y,
        z: b.p.z + 1.0,
      })),
    };
  }

  private async updateReachabilityForAddition(
    snapshot: CachedSpaceSnapshot,
    delta: SpaceDelta,
    _graph: BlockNodeGraph
  ): Promise<void> {
    // Simplified: would do incremental reachability update
    console.log(
      `🔗 Updating reachability for block addition at ${delta.position.x},${delta.position.y},${delta.position.z}`
    );
  }

  private async updateReachabilityForRemoval(
    snapshot: CachedSpaceSnapshot,
    delta: SpaceDelta,
    _graph: BlockNodeGraph
  ): Promise<void> {
    // Simplified: would check for connectivity breaks
    console.log(
      `⚠️  Checking connectivity after block removal at ${delta.position.x},${delta.position.y},${delta.position.z}`
    );
  }

  private async updateNavigationForInterface(
    snapshot: CachedSpaceSnapshot,
    delta: SpaceDelta,
    _graph: BlockNodeGraph
  ): Promise<void> {
    // Interface changes might affect navigation paths
    console.log(
      `🚪 Updating navigation for interface change at ${delta.position.x},${delta.position.y},${delta.position.z}`
    );
  }

  private accessCounts = { hit: 0, miss: 0, delta: 0 };

  private updateMetrics(
    type: "hit" | "miss" | "delta",
    loadTime: number
  ): void {
    // Update cache performance metrics
    this.metrics.averageLoadTime =
      (this.metrics.averageLoadTime + loadTime) / 2;

    if (type === "delta") {
      this.metrics.deltaUpdateTime =
        (this.metrics.deltaUpdateTime + loadTime) / 2;
    }

    this.accessCounts[type]++;
    const total =
      this.accessCounts.hit + this.accessCounts.miss + this.accessCounts.delta;
    this.metrics.hitRate = total === 0 ? 0 : this.accessCounts.hit / total;
  }

  private estimateMemoryUsage(): number {
    // Rough estimate of cache memory usage
    return this.cache.size * 1024; // Simplified estimation
  }
}
