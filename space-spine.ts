/**
 * The ONE computed structure side-tape law, shared by every consumer.
 *
 * A side-tape exists only when Spaces stack. Its anchor is the structure box's
 * max-x/max-depth corner and its floor directory is stable bottom-up order.
 * The anchor is a hint: the reducer resolves the real landing from each
 * floor's derived standable grid. Nothing here authors a voxel or a shaft.
 */

import { ValidationError } from "./core/schemas";

/** One structure floor as read from the STDB `space` table. */
export interface SpineRow {
  spaceId: string;
  label: string;
  minZ: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpineResult {
  /** Shared side-tape anchor (zone-local). */
  x: number;
  z: number;
  /** Elevation-ordered floors (ground → top). */
  floors: { spaceId: string; label: string; minZ: number }[];
}

/** Compute the max-x/max-depth anchor once over the whole stack. */
export function spineColumnFromRows(rows: SpineRow[]): { x: number; z: number } {
  if (rows.length === 0) throw new Error("cannot derive a side-tape from zero Spaces");
  return {
    x: Math.max(...rows.map((row) => row.maxX)),
    z: Math.max(...rows.map((row) => row.maxY)),
  };
}

/** Build the complete side-tape projection; a single floor needs no tape. */
export function spineFromRows(
  _structureId: string,
  rows: SpineRow[]
): SpineResult | null {
  if (rows.length < 2) return null;
  const anchor = spineColumnFromRows(rows);
  const floors = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.minZ - b.row.minZ || a.index - b.index)
    .map(({ row }) => ({
      spaceId: row.spaceId,
      label: row.label,
      minZ: row.minZ,
    }));

  return { ...anchor, floors };
}

/** Check an independently supplied projection against the derivation law. */
export function validateSpineIntegrity(
  spine: SpineResult | null,
  rows: SpineRow[]
): ValidationError[] {
  const expected = spineFromRows("validation", rows);
  if (!expected && !spine) return [];
  if (!expected || !spine) {
    return [{
      code: "SPINE_FLOOR_COUNT",
      message: "A side-tape exists if and only if at least two Spaces stack",
    }];
  }

  const errors: ValidationError[] = [];
  if (spine.x !== expected.x || spine.z !== expected.z) {
    errors.push({
      code: "SPINE_WRONG_POSITION",
      message: `Side-tape anchor (${spine.x},${spine.z}) must equal the structure max corner (${expected.x},${expected.z})`,
      details: {
        expected: { x: expected.x, z: expected.z },
        actual: { x: spine.x, z: spine.z },
      },
    });
  }

  const actualFloors = spine.floors.map((floor) => `${floor.spaceId}@${floor.minZ}`);
  const expectedFloors = expected.floors.map((floor) => `${floor.spaceId}@${floor.minZ}`);
  if (JSON.stringify(actualFloors) !== JSON.stringify(expectedFloors)) {
    errors.push({
      code: "SPINE_FLOOR_DIRECTORY",
      message: "Side-tape floors must contain every stacked Space in stable bottom-up order",
      details: { expected: expectedFloors, actual: actualFloors },
    });
  }
  return errors;
}
