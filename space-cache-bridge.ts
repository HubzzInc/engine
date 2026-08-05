/**
 * NESWUD cache bridge — the engine SpaceCacheManager as a live consumer.
 *
 * One manager per runtime. Consumers hand it a space's blocks; it builds the
 * handshake graph and returns the engine's CachedSpaceSnapshot (reachability,
 * boundaries, spawn points, and the space's 2D-Net fingerprint) with cache
 * invalidation and hit/miss metrics. Invalidation honors an optional
 * server-derived `updated_at` version key (the `space_scene.updated_at`), with
 * the engine's block-checksum as the fallback when no key is supplied. The
 * delta-apply stubs in the engine stay untouched: scenes travel as whole
 * payloads (no delta wire format exists), so the designed full-remap fallback
 * is the correct behavior.
 */
import { createBlockNode } from "./core/schemas";
import { BlockNodeGraph } from "./core/block-node";
import { SpaceCacheManager, CachedSpaceSnapshot, CacheMetrics } from "./core/space-cache";
import { netFingerprint } from "./space-shape";

const manager = new SpaceCacheManager();

function buildGraph(blocks: { x: number; y: number; z: number }[]): BlockNodeGraph {
  const graph = new BlockNodeGraph();
  const seen = new Set<string>();
  for (const b of blocks) {
    const k = `c_${b.x}_${b.y}_${b.z}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // nl (x, up=y, z) -> engine (x, y=depth, z=up)
    graph.addBlock(createBlockNode(k, "cache", { x: b.x, y: b.z, z: b.y }));
  }
  for (const k of seen) graph.autoLinkBlock(k);
  return graph;
}

/**
 * Engine-cached snapshot for a space's blocks. The snapshot carries the space's
 * canonical 2D-Net `fingerprint` (`netFingerprint(blocks).id`) so a warm hit
 * exposes the same shape identity a cold recompute would.
 *
 * `updatedAt` (additive, optional) is the server's `space_scene.updated_at`
 * version key: when supplied it is the invalidation authority, so a republish
 * (new updated_at) invalidates the snapshot even when the block positions
 * round-trip identically. When omitted the engine falls back to its own
 * block-checksum version exactly as before.
 */
export async function getCachedSnapshot(
  spaceId: string,
  blocks: { x: number; y: number; z: number }[],
  updatedAt?: string | number,
): Promise<CachedSpaceSnapshot> {
  const fingerprint = netFingerprint(blocks).id;
  const versionKey = updatedAt === undefined ? undefined : String(updatedAt);
  return manager.getSpace(spaceId, buildGraph(blocks), false, { versionKey, fingerprint });
}

/** The engine's own cache metrics (hit rate, load times, memory). */
export function cacheMetrics(): CacheMetrics {
  return manager.getMetrics();
}

/** Drop a space's snapshot (e.g. after a republish). */
export function invalidate(spaceId: string): void {
  manager.invalidateSpace(spaceId);
}
