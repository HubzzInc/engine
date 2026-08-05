/**
 * Core Constants and Enums for Hubzz Voxel Engine
 * Based on Technical Specification: Hubzz Voxel Engine Full Parameter Set
 */

// =============================================================================
// WORLD UNITS AND DIMENSIONS
// =============================================================================

/** Tile size in meters */
export const TILE_SIZE = 1.0;

/** Block size in meters (cubic) */
export const BLOCK_SIZE = 1.0;

/** Character height in blocks (approximately) */
export const CHARACTER_HEIGHT = 1.5;

// =============================================================================
// ZONE CONFIGURATION
// =============================================================================

/** Zone surface grid size */
export const ZONE_GRID_SIZE = 64;

// --- the zone edge reserve --------------------------------------------------
// Owner, 2026-07-25: "the inset per zone is actually 2 tiles for the road and 2
// more of the sidewalk. we did it like this so when combining it would work
// easily." Two abutting zones each contribute their road tiles, so the shared
// street is a symmetric 4 wide, and a landmark merge (CANON-LEDGER ruling 18)
// releases the interior seam without re-deriving geometry.
//
// BOTH PARTS ARE NAMED ON PURPOSE. This file once carried only a single
// unqualified total, and `zone_engine` once carried only `INSET_SIZE = 2`
// commented "Sidewalk width" — the sidewalk half, which contradicted
// docs/SPEC-ZONE-ARCHITECTURE.md ("the 56x56-in-64x64 buildable margin") and was
// misread as the whole rule. Both sides now name road and sidewalk and sum
// them. Never re-introduce a single unqualified "inset" constant.

/** Street lane reserved at a zone edge. Shared with the neighbour's lane. */
export const ZONE_ROAD_WIDTH = 2;

/** Pedestrian path reserved inside the road. The oracle's `INSET_SIZE`. */
export const ZONE_SIDEWALK_WIDTH = 2;

/**
 * The FULL non-buildable border on each edge of a zone: road + sidewalk = 4.
 * Buildable is therefore `[ZONE_EDGE_RESERVE, ZONE_GRID_SIZE - 1 - ZONE_EDGE_RESERVE]`
 * = `[4, 59]`, a 56x56 core.
 *
 * ENFORCED on the authoring/publish path via `zoneEdgeReserveViolations` below
 * — see that function for why this is a PLACEMENT rule and must never move into
 * the shape gate. `zone_engine` enforces the same 4 in `Zone._check_inset`.
 */
export const ZONE_EDGE_RESERVE = ZONE_ROAD_WIDTH + ZONE_SIDEWALK_WIDTH;

/** Lowest buildable index on either axis once the reserve is enforced. */
export const ZONE_BUILDABLE_MIN = ZONE_EDGE_RESERVE;

/** Highest buildable index on either axis once the reserve is enforced. */
export const ZONE_BUILDABLE_MAX = ZONE_GRID_SIZE - 1 - ZONE_EDGE_RESERVE;

/**
 * Cells that sit in a zone's edge reserve — the road/sidewalk band.
 *
 * This is a PLACEMENT rule, not a shape rule, and the layering matters: the
 * Python reference enforces it in `Zone.add_voxel` -> `_check_inset`, NOT in its
 * validator, so a Space's SHAPE is judged independently of where the Space sits.
 * Keep it that way. `validateUploadedSpace` must stay placement-blind, or every
 * origin-anchored shape fixture in the cross-check would fail for the wrong
 * reason.
 *
 * Call this on the authoring/publish path, with ZONE-LOCAL coordinates.
 * Returns the offending cells so a caller can report them, empty when clear.
 *
 * A landmark district lifts the reserve on its INTERIOR seams only (ruling 18);
 * that case is not handled here because the skin publishes one zone at a time.
 */
export function zoneEdgeReserveViolations(
  cells: Array<{ x: number; z: number }>,
): Array<{ x: number; z: number }> {
  return cells.filter(
    (c) =>
      c.x < ZONE_BUILDABLE_MIN || c.x > ZONE_BUILDABLE_MAX ||
      c.z < ZONE_BUILDABLE_MIN || c.z > ZONE_BUILDABLE_MAX,
  );
}

/** Zone block budgets by tier */
export const ZONE_BUDGETS = {
  Central: 50000,
  Mid: 40000,
  Outer: 30000,
} as const;

/**
 * Zone coordinate ranges.
 *
 * Mid is `[-9,-9]..[9,9]`, and the COUNTS in SPEC §2.1 are why: Central 11x11
 * = 121 ✓, and Mid must come to 240 — `|x| <= 8` gives 17x17 − 121 = 168 ✗,
 * `|x| <= 9` gives 19x19 − 121 = 240 ✓. This read `[-8,-8]..[8,8]` and was
 * corrected with the spec on 2026-07-26 (owner: "math is truth"). Outer begins
 * at 10. Pinned by `zone_counts_match_the_spec` in `spacetime/laws`.
 */
export const ZONE_COORDS = {
  Central: { min: [-5, -5], max: [5, 5] },
  Mid: { min: [-9, -9], max: [9, 9] },
  Outer: { min: [-10, -10], max: [10, 10] },
} as const;

// =============================================================================
// SPACE AND STRUCTURE RULES
// =============================================================================

/** Minimum space height in blocks */
export const MIN_SPACE_HEIGHT = 2;

/** Minimum floor area in tiles (16 tiles → 4 concurrent players at 1 per 4 tiles) */
export const MIN_FLOOR_AREA = 16;

/** Minimum width between walls in tiles */
export const MIN_WALL_WIDTH = 3;

/** Floor to height ratio multiplier */
export const FLOOR_HEIGHT_RATIO = 8;

/** Occupancy density factor (users per floor tiles) */
export const OCCUPANCY_DENSITY_FACTOR = 4;

/** Structure separation in blocks */
export const STRUCTURE_SEPARATION = 1;

/** Allowed (quantized) stack heights — the QUANTIZED_HEIGHT validation rule.
 *  Mirrored byte-for-byte by the Rust `ALLOWED_HEIGHTS`
 *  (spacetime/laws/src/lib.rs:565) and the oracle (zone_engine/core/config.py:42). */
export const ALLOWED_HEIGHTS = [2, 4, 6, 8] as const;

// =============================================================================
// RENDERING AND LOD
// =============================================================================

/** Default full geometry radius in meters */
export const DEFAULT_FULL_GEOMETRY_RADIUS = 24;

/** Default impostor distance in meters */
export const DEFAULT_IMPOSTOR_DISTANCE = 72;

/** Maximum columns per frame for streaming */
export const MAX_COLUMNS_PER_FRAME = 256;

/** Maximum blocks per frame for streaming */
export const MAX_BLOCKS_PER_FRAME = 8192;

/** Maximum milliseconds per frame for streaming */
export const MAX_MS_PER_FRAME = 6;

// =============================================================================
// ENUMERATIONS
// =============================================================================

/** Space types within zones */
export enum SpaceType {
  Public = "Public",
  Private = "Private",
  Flex = "Flex",
}

/** Material categories for rendering */
export enum MaterialCategory {
  Opaque = "Opaque",
  Translucent = "Translucent",
  Emissive = "Emissive",
  PBRLayered = "PBRLayered",
}

/** Surface types attached to exposed block faces */
export enum InterfaceType {
  Wall = "Wall",
  Window = "Window",
  Door = "Door",
  DoorLink = "DoorLink",
  Stair = "Stair",
  Portal = "Portal",
  ActionTile = "ActionTile",
  Utility = "Utility",
}

/** Neighbor directions for 2D-Net graph */
export enum NeighborDir {
  N = "N",
  S = "S",
  E = "E",
  W = "W",
  Up = "Up",
  Down = "Down",
}

/** Zone tiers */
export enum ZoneTier {
  Central = "Central",
  Mid = "Mid",
  Outer = "Outer",
}

/** Asset kinds for content system */
export enum AssetKind {
  BlockSkin = "BlockSkin",
  InterfaceSkin = "InterfaceSkin",
  Prop = "Prop",
  Avatar = "Avatar",
  Decal = "Decal",
}

/** Validation status */
export enum ValidationStatus {
  Pending = "pending",
  Pass = "pass",
  Fail = "fail",
}

// =============================================================================
// BIT LAYOUT FOR 2D-NET ENCODING
// =============================================================================

/** Bit positions for 2D-Net bitmask encoding */
export const NET_BIT_LAYOUT = {
  N: 0, // North neighbor
  E: 1, // East neighbor
  S: 2, // South neighbor
  W: 3, // West neighbor
  PLUS: 4, // Voxel present
  V1: 5, // Vertical flag 1
  V2: 6, // Vertical flag 2
  R: 7, // Reserved
} as const;

// =============================================================================
// COORDINATE SYSTEM (Moved to schemas.ts to avoid circular imports)
// =============================================================================

// =============================================================================
// NEIGHBOR LINK UTILITIES
// =============================================================================

/** All neighbor directions as array */
export const ALL_NEIGHBOR_DIRS = Object.values(NeighborDir);

/** Opposite direction mapping */
export const OPPOSITE_DIR: Record<NeighborDir, NeighborDir> = {
  [NeighborDir.N]: NeighborDir.S,
  [NeighborDir.S]: NeighborDir.N,
  [NeighborDir.E]: NeighborDir.W,
  [NeighborDir.W]: NeighborDir.E,
  [NeighborDir.Up]: NeighborDir.Down,
  [NeighborDir.Down]: NeighborDir.Up,
};

/** Direction to 3D offset mapping */
export const DIR_TO_OFFSET: Record<
  NeighborDir,
  { x: number; y: number; z: number }
> = {
  [NeighborDir.N]: { x: 0, y: 1, z: 0 },
  [NeighborDir.S]: { x: 0, y: -1, z: 0 },
  [NeighborDir.E]: { x: 1, y: 0, z: 0 },
  [NeighborDir.W]: { x: -1, y: 0, z: 0 },
  [NeighborDir.Up]: { x: 0, y: 0, z: 1 },
  [NeighborDir.Down]: { x: 0, y: 0, z: -1 },
};

// =============================================================================
// VALIDATION CONSTANTS
// =============================================================================

/** Maximum span height per batch for streaming */
export const MAX_SPAN_HEIGHT_PER_BATCH = 8;

/** Sparse padding ring for streaming */
export const SPARSE_PADDING_RING = 1;

/** Default streaming weights */
export const STREAMING_WEIGHTS = {
  w1: 0.5, // Distance to player
  w2: 0.2, // Visibility weight
  w3: 0.2, // Interface proximity
  w4: 0.1, // Space edit activity
} as const;
