/**
 * network-lab → NESWUD validation bridge.
 *
 * network-lab's `POST /api/v1/uploadSpace` currently persists blocks with no
 * gameplay validation. This bridge maps an uploaded space payload into the
 * NESWUD engine model and runs the full ValidationEngine (the 8 rules), so a
 * space can only become an instance if it actually passes.
 *
 * STDB MIGRATION NOTE (P4): this is the reducer-equivalent of the spatial layer.
 * It is already shaped the way SpacetimeDB wants — a PURE validate-before-commit
 * step with no side effects of its own. The future `upload_space` reducer is
 * exactly this function + the persist call: validate the payload in-reducer and
 * only write the WorldMap/space rows if the 8 rules pass (atomic commit). No
 * logic move is needed at migration — only the persistence call site changes.
 *
 * Axis note: network-lab "up" is Y; the engine's "up" is Z. We map
 * nl(x, y, z) -> engine(x, z, y).
 */
import { BlockNodeGraph } from "./core/block-node";
import { ZoneTier, ZONE_BUDGETS } from "./core/constants";
import type { BoundingBox, Zone } from "./core/schemas";
import { createBlockNode } from "./core/schemas";
import { SpaceDetectionEngine } from "./core/space";
import { ValidationEngine } from "./core/validation";
import { computeRooms } from "./space-rooms";

export interface UploadedBlock {
  x: number;
  y: number; // network-lab up-axis
  z: number;
  type?: number;
}

/** An authored interface element (engine InterfaceElement, network-lab axes):
 *  the door/window/door-link attached to the wall block at (x,y,z), facing
 *  `dir` (N=+z, S=-z, E=+x, W=-x, U=+y, D=-y). */
export interface UploadedInterface {
  x: number;
  y: number; // network-lab up-axis
  z: number;
  dir: "N" | "E" | "S" | "W" | "U" | "D";
  type: string; // engine InterfaceType name (Door | DoorLink | Window | ...)
  width?: number;
  height?: number;
  params?: Record<string, unknown>;
}

export interface UploadSpacePayload {
  spaceId: number;
  tileId: number;
  blocks: UploadedBlock[];
  /** Space kind (public | private | flex) — drives the engine's per-kind rules. */
  kind?: string;
  /** Authored interface elements (the engine's full door/window model). */
  interfaces?: UploadedInterface[];
  /** The space is reached by a structure spine (a stacked floor) — waives the
   *  private-entrance door requirement (the spine is the entrance). */
  spineReachable?: boolean;
  /** Bounding boxes of already-published spaces in the same zone, for the
   *  space-intersection check (spaces may never overlap).  Each entry is the
   *  bounding box of an existing space in engine coordinates (x, y=depth,
   *  z=up).  The candidate's detected bounding box is checked against each. */
  existingSpaces?: BoundingBox[];
}

export interface GateResult {
  valid: boolean;
  errors: string[];
  /** Non-blocking findings (e.g. SEALED_ROOM — legal decorative voids). */
  warnings: string[];
  spaceCount: number;
}

/** network-lab direction letters -> engine NeighborDir (engine y = nl z; engine z = nl y). */
const NL_TO_ENGINE_DIR: Record<UploadedInterface["dir"], string> = {
  N: "N", S: "S", E: "E", W: "W", U: "Up", D: "Down",
};

/** Space kind (STDB) -> engine SpaceType. */
const KIND_TO_SPACE_TYPE: Record<string, string> = {
  public: "Public",
  private: "Private",
  flex: "Flex",
};

export function validateUploadedSpace(
  payload: UploadSpacePayload,
  rules: Partial<import("./core/validation").ValidationRuleConfig> = {},
  knownSpaceIds?: string[],
): GateResult {
  const zone: Zone = {
    zoneId: `tile-${payload.tileId}`,
    tier: ZoneTier.Central,
    coords: [0, 0],
    blockBudget: ZONE_BUDGETS.Central,
    structures: [],
    policies: { access: "public", moderation: {} },
  };
  const graph = new BlockNodeGraph();

  // Dedupe with the SAME 3-decimal rounding the graph's positionToKey uses —
  // a 0.0001 near-duplicate must collapse here, or addBlock throws on the
  // rounded-key collision downstream (block-node.ts positionToKey/addBlock).
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const idFor = (b: { x: number; y: number; z: number }) => `b_${r3(b.x)}_${r3(b.y)}_${r3(b.z)}`;
  const minY = payload.blocks.reduce((m, b) => Math.min(m, b.y), Number.MAX_SAFE_INTEGER);

  // network-lab allows duplicate blocks in a payload; dedupe before building the graph.
  const seen = new Set<string>();
  const unique = payload.blocks.filter((b) => {
    const k = idFor(b);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  for (const b of unique) {
    // network-lab (x, up=y, z) -> engine (x, y=depth, z=up)
    const node = createBlockNode(idFor(b), zone.zoneId, { x: b.x, y: b.z, z: b.y });
    if (b.y === minY) node.flags.foundation = true;
    graph.addBlock(node);
  }
  for (const b of unique) graph.autoLinkBlock(idFor(b));

  // Attach the authored interface elements (the engine's door/window model)
  // onto their wall blocks so the interface rules can reason about them.
  for (const iface of payload.interfaces ?? []) {
    graph.addInterface(idFor(iface), {
      type: iface.type as any,
      dir: NL_TO_ENGINE_DIR[iface.dir] as any,
      width: iface.width ?? 1.0, // span does not encode width
      // NOT the span law. InterfaceElement.height is a FRACTION of one block
      // face — block-node addInterface rejects anything > 1.0 — so it cannot
      // carry the layer-count span. Reading interfaceSpan(iface)[1] here
      // (attempted, audit 2026-08-05) made addInterface drop every 2-layer
      // Door and the entrance rule failed. The vertical span travels intact in
      // `params.span` below; layer-count consumers use interfaceSpan().
      height: iface.height ?? 1.0,
      params: iface.params,
    });
  }

  const analysis = new SpaceDetectionEngine().analyzeSpaces(graph, zone.zoneId);

  // The payload IS one space — its declared kind overrides the size heuristic
  // so per-kind rules (e.g. private entrance requirement) fire correctly.
  const spaceType = payload.kind ? KIND_TO_SPACE_TYPE[payload.kind.toLowerCase()] : undefined;
  if (spaceType) {
    for (const space of analysis.spaces) space.type = spaceType as any;
  }

  const result = new ValidationEngine(rules).validateZone(
    zone as any,
    graph.getAllBlocks(),
    analysis.spaces,
    [],
    knownSpaceIds,
    payload.spineReachable
  );

  // Space intersection check — the candidate's detected bounding box vs the
  // bounding boxes of already-published spaces in the same zone.  Spaces may
  // never overlap (bounding boxes must not intersect on all three axes).
  const intersectionErrors: string[] = [];
  if (payload.existingSpaces && payload.existingSpaces.length > 0) {
    const engine = new ValidationEngine(rules);
    for (const space of analysis.spaces) {
      intersectionErrors.push(
        ...engine
          .validateSpaceIntersection(
            space.boundingBox,
            payload.existingSpaces,
            space.spaceId
          )
          .map((e) => e.message)
      );
    }
  }

  // Sealed rooms (engine hollow spaces) are unreachable by construction —
  // legal, but worth surfacing to the author. Passing the authored interfaces
  // lets the rooms bridge also derive reachability (door-connected rooms), but
  // SEALED_ROOM stays a warning either way — a genuinely sealed void is legal.
  const rooms = computeRooms(unique, payload.interfaces as import("./space-rooms").RoomInterface[] | undefined);
  const warnings = rooms.sealedRooms.map(
    (r) => `SEALED_ROOM: ${r.cells}-cell enclosed air pocket at x${r.bounds.minX}-${r.bounds.maxX} z${r.bounds.minZ}-${r.bounds.maxZ} — no player can reach it`,
  );

  // A payload that yields ZERO detected spaces is never publishable. This
  // covers both an empty scene and components that fell below the minimum
  // floor area / height: SpaceDetectionEngine has no Space on which to run the
  // per-space rules, so the gate must supply the hard failure itself.
  const errors = [...result.errors, ...intersectionErrors];
  if (analysis.spaces.length === 0) {
    errors.push(
      "NO_VALID_SPACE: uploaded blocks did not form a space meeting the minimum floor area/height",
    );
  } else if (analysis.spaces.length > 1) {
    errors.push(
      `MULTIPLE_SPACES: one saved Space must be one flood-fill cluster (found ${analysis.spaces.length})`,
    );
  }

  return { valid: errors.length === 0, errors, warnings, spaceCount: analysis.spaces.length };
}
