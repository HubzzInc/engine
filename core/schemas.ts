/**
 * Canonical Data Schemas for Hubzz Voxel Engine
 * Based on Technical Specification: Canonical Data Schemas (Engine-Side)
 */

import {
  SpaceType,
  InterfaceType,
  NeighborDir,
  ZoneTier,
  ValidationStatus,
} from "./constants";

// =============================================================================
// COORDINATE SYSTEM
// =============================================================================

/** 3D position interface */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/** 2D position interface */
export interface Position2D {
  x: number;
  y: number;
}

/** Bounding box interface */
export interface BoundingBox {
  min: Position3D;
  max: Position3D;
}

// =============================================================================
// CORE INTERFACES
// =============================================================================

/** Typed surface attached to a block face with no neighbor handshake */
export interface InterfaceElement {
  type: InterfaceType;
  dir: NeighborDir;
  width: number;
  height: number;
  position?: Position3D;
  params?: Record<string, unknown>;
}

/** Block skins for interior/exterior */
export interface BlockSkins {
  interior: string;
  exterior: string;
}

/** Block flags */
export interface BlockFlags {
  walkableTop: boolean;
  foundation: boolean;
  /**
   * True when at least one of the block's 6 faces is exposed to open space
   * (no neighbouring block on that side).  Set by `markExteriorBlocks()` in
   * space-builder.  The renderer uses this to skip face generation for fully
   * enclosed (interior) blocks, and to select the correct skin (interior vs
   * exterior) for partially exposed blocks.
   */
  isExternal: boolean;
}

/** Block metadata */
export interface BlockMeta {
  createdBy: string;
  createdAt: number;
}

/** Neighbor links map */
export type NeighborLinks = Partial<Record<NeighborDir, string | null>>;

// =============================================================================
// BLOCK NODE (2D-Net Primitive)
// =============================================================================

/** Core 2D-Net block node */
export interface BlockNode {
  /** Unique identifier */
  id: string;

  /** Zone this block belongs to */
  zoneId: string;

  /** 3D position in world space */
  p: Position3D;

  /** Links to neighboring blocks */
  neighbors: NeighborLinks;

  /** Block behavior flags */
  flags: BlockFlags;

  /** Interior and exterior skins */
  skins: BlockSkins;

  /** Typed surfaces on exposed faces */
  interfaces: InterfaceElement[];

  /** Creation metadata */
  meta: BlockMeta;
}

// =============================================================================
// SPACE (Connected Component)
// =============================================================================

/** Space interfaces configuration */
export interface SpaceInterfaces {
  /** Bottom footprint for stacking */
  bottom: {
    footprint: Position2D[];
  };

  /** Top footprint for stacking */
  top: {
    footprint: Position2D[];
  };

  /** Interface elements */
  elements: Array<{
    type: InterfaceType;
    dir?: NeighborDir;
    targetSpaceId?: string;
    pos?: Position3D;
    action?: string;
    params?: Record<string, unknown>;
    floors?: Array<{
      label: string;
      targetSpaceId: string;
    }>;
  }>;
}

/** Impostor mesh configuration */
export interface ImpostorConfig {
  meshAssetId: string;
  triggerDistance: number;
}

/** 2D Net encoding data */
export interface NetEncoding {
  /** Base bitmask channel */
  bitmaskChannel: string;

  /** Bit layout mapping */
  bitLayout: Record<string, number>;

  /** Vertical semantics description */
  verticalSemantics: string;

  /** Repetition map for compression */
  repetitionMap: string;

  /** Optional material map */
  materialMapChannel?: string;

  /** Optional labels map */
  labelsMap?: string;

  /** Merkle root for integrity */
  merkleRoot: string;
}

/** Validation result */
export interface ValidationResult {
  status: ValidationStatus;
  errors: string[];
}

/** Connected component space */
export interface Space {
  /** Unique space identifier */
  spaceId: string;

  /** Zone this space belongs to */
  zoneId: string;

  /** Block IDs comprising this space */
  blockIds: string[];

  /** 3D bounding box */
  boundingBox: BoundingBox;

  /** Space type classification */
  type: SpaceType;

  /** Computed/view labels that do not create another authored Space kind. */
  tags?: string[];

  /** Interface configuration */
  interfaces: SpaceInterfaces;

  /** Impostor configuration */
  impostor: ImpostorConfig;

  /** 2D Net encoding */
  netEncoding: NetEncoding;

  /** Schema version */
  version: number;

  /** Validation status */
  validation: ValidationResult;
}

// =============================================================================
// STRUCTURE (Stacked Spaces)
// =============================================================================

/** Structure separation rules */
export interface StructureSeparation {
  minBlocks: number;
}

/** Structure metadata */
export interface StructureMeta {
  name: string;
}

/** Independent building structure */
export interface Structure {
  /** Unique structure identifier */
  structureId: string;

  /** Zone this structure belongs to */
  zoneId: string;

  /** Space IDs in this structure (all floors/rooms of the building) */
  spaceIds: string[];

  /**
   * The designated entry/lobby space for this structure.
   * When set, `getStructureEntrySpace()` returns this space as the building's
   * combined spawn point (e.g. a ground-floor lobby that gives access to all
   * upper floors).  When absent, the lowest-elevation space is used as fallback.
   */
  entrySpaceId?: string;

  /** Separation requirements */
  separation: StructureSeparation;

  /** Structure metadata */
  meta: StructureMeta;
}

// =============================================================================
// PROPERTY (Ownable Unit)
// =============================================================================

/** Ownable property unit */
export interface Property {
  /** Unique property identifier */
  propertyId: string;

  /** Zone this property belongs to */
  zoneId: string;

  /** Property category */
  category: "Public Area" | "Private Property" | "Flex";

  /** Block cluster positions */
  blockCluster: Position3D[];

  /** Simplified bounding box */
  boundingBox: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  };

  /** Owner identifier */
  ownerId: string;

  /** Additional metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// ZONE (Sovereign Territory)
// =============================================================================

/** Zone policies */
export interface ZonePolicies {
  access: string;
  moderation: Record<string, unknown>;
}

/** Zone container */
export interface Zone {
  /** Zone identifier */
  zoneId: string;

  /** Zone tier classification */
  tier: ZoneTier;

  /** Zone coordinates */
  coords: [number, number];

  /** Block budget for this zone */
  blockBudget: number;

  /** Structure IDs in this zone */
  structures: string[];

  /** Zone policies */
  policies: ZonePolicies;
}

// =============================================================================
// SPACE SNAPSHOT (Streaming/Caching)
// =============================================================================

/** Column span definition */
export interface ColumnSpan {
  x: number;
  y: number;
  spans: Array<[number, number]>;
}

/** Space snapshot for streaming */
export interface SpaceSnapshot {
  /** Snapshot identifier (hash) */
  snapshotId: string;

  /** Space this snapshot represents */
  spaceId: string;

  /** Zone identifier */
  zoneId: string;

  /** Block IDs in snapshot */
  blockIds: string[];

  /** Column definitions */
  columns: ColumnSpan[];

  /** Content hash */
  hash: string;

  /** Snapshot version */
  version: number;
}

// =============================================================================
// IRREGULAR BOUNDING VOLUME DESCRIPTOR (IBVD)
// =============================================================================

/** Footprint polygon definition */
export interface FootprintPolygon {
  polygons: Position2D[][];
  resolution: number;
}

/** Oriented bounding box */
export interface OBB {
  center: Position3D;
  axes: [Position3D, Position3D, Position3D];
  extents: [number, number, number];
}

/** Irregular bounding volume descriptor */
export interface IBVD {
  /** Space identifier */
  spaceId: string;

  /** Zone identifier */
  zoneId: string;

  /** 2D footprint definition */
  footprint: FootprintPolygon;

  /** Column spans */
  columns: ColumnSpan[];

  /** Axis-aligned bounding box */
  aabb: BoundingBox;

  /** Optional oriented bounding box */
  obb?: OBB;
}

// =============================================================================
// VALIDATION INTERFACES
// =============================================================================

/** Validation error detail */
export interface ValidationError {
  code: string;
  message: string;
  blockId?: string;
  spaceId?: string;
  details?: Record<string, unknown>;
}

/** Validation context */
export interface ValidationContext {
  zoneId: string;
  blockBudget: number;
  existingBlocks: BlockNode[];
  existingSpaces: Space[];
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/** Create a new block node with default values */
export function createBlockNode(
  id: string,
  zoneId: string,
  position: Position3D
): BlockNode {
  return {
    id,
    zoneId,
    p: position,
    neighbors: {},
    flags: {
      walkableTop: true,
      foundation: false,
      isExternal: true, // freshly placed block has no neighbours — always external until markExteriorBlocks() runs
    },
    skins: {
      interior: "default",
      exterior: "default",
    },
    interfaces: [],
    meta: {
      createdBy: "system",
      createdAt: Date.now(),
    },
  };
}

/** Create a new space with default values */
export function createSpace(
  spaceId: string,
  zoneId: string,
  type: SpaceType = SpaceType.Public
): Space {
  return {
    spaceId,
    zoneId,
    blockIds: [],
    boundingBox: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    },
    type,
    interfaces: {
      bottom: { footprint: [] },
      top: { footprint: [] },
      elements: [],
    },
    impostor: {
      meshAssetId: "default",
      triggerDistance: 72,
    },
    netEncoding: {
      bitmaskChannel: "",
      bitLayout: {
        N: 0,
        E: 1,
        S: 2,
        W: 3,
        "+": 4,
        V1: 5,
        V2: 6,
        R: 7,
      },
      verticalSemantics: "V1/V2 encode vertical continuation/termination",
      repetitionMap: "",
      merkleRoot: "",
    },
    version: 1,
    validation: {
      status: ValidationStatus.Pending,
      errors: [],
    },
  };
}
