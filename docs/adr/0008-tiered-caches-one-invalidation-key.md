# 0008 — Tiered caches, one invalidation key

**Status:** Accepted (2026-07-07)

## Context

The engine-integration roadmap's Phase 7 ("space-cache behind rebuilds") specified routing
`Dollhouse.rebuildFor` and the editor's shape computation through the engine's
`SpaceCacheManager`. The 2026-07-05 reconciliation found three independent caches and flagged
the unification as delicate: "a naive merge could regress door/spine transitions or lose
republish invalidation" — offering "explicitly re-scope the phase to accept two caches" as the
alternative. ER-06 subsequently gave the engine cache a canonical fingerprint and a
server-derived version key. This ADR resolves the remaining item (ER-09) by re-scoping.

The three caches, inspected:

| Cache | Holds | Job | Invalidation |
|---|---|---|---|
| Engine `SpaceCacheManager` (`engine/core/space-cache.ts` + bridge) | boundaries, spawn points, **2D-Net fingerprint**, version | avoid recomputing the SHAPE LAW over blocks | `space_scene.updated_at` folded with the block checksum (ER-06) |
| Dollhouse `sceneCache` (`apps/world-client/src/spatial/Dollhouse.ts:56`) | raw scene JSON, `space` box row, `space_link` rows, spine | avoid re-FETCHING over HTTP on A→B→A transitions | `space_scene.updated_at` (server-derived) |
| Editor `SpaceShell` memo (`apps/space-editor/src/scene/SpaceShell.ts:96`) | one `computeSpaceShape` result | avoid recomputing shape inside the render loop (shell rebuilds on orbit) | block-array identity |

## Decision

**Keep the tiers. Do not merge them.** The unifying contract is the **invalidation key**, not
the container: every cache of published-space state keys its validity on the server's
`space_scene.updated_at` (the editor memo is exempt — it caches unsaved, in-editor authoring
state, for which no server stamp exists; block-array identity is its correct key).

- The engine cache is the ONE **shape** cache — anything that wants derived shape/fingerprint
  reuse goes through `getCachedSnapshot(spaceId, blocks, updatedAt)`.
- The Dollhouse cache is a **fetch** cache — network artifacts (scene JSON, rows) stay
  client-side; the engine has no business holding HTTP payloads.
- The editor memo is a **frame-local** memo — a single identity check, free and correct.

## Consequences

- No cross-tier regression risk (door/spine transition state never moves containers).
- Republish invalidation is uniform: an `updated_at` bump invalidates the Dollhouse fetch
  cache and the engine shape cache independently but consistently (both CI-pinned:
  `engine-checks` "updated_at bump invalidates"; the Dollhouse key at `loadCurrent`).
- Phase 7's exit criterion is met in substance — server-derived invalidation everywhere a
  server stamp exists — without the speculative container merge.
- If a future consumer needs scene JSON keyed by shape (not by fetch), extend
  `CachedSpaceSnapshot` THEN, with that consumer as the test case.
