/**
 * The floor arrow that points at a door or portal — ported from the viz PoC.
 *
 * `viz/live/tower_halls_scene.py` `door_display()`: "floor arrows: one per
 * interface, on the tile in front of the opening, pointing toward the
 * door/portal face". The geometry below is that construction verbatim — every
 * constant is the PoC's, not a re-derivation, so the two renderers can be held
 * byte-equal by `ci/dollhouse-matrix.mjs`.
 *
 * It lives in the ENGINE rather than in a renderer because both the
 * world-client's Dollhouse and the skin's ThreeScene need the same arrow, and
 * a second construction beside this one is exactly the drift the dollhouse
 * matrix exists to catch.
 *
 * The PoC works in its own (x, y-up-in-plan, z-height) frame; `arrowPolygon`
 * returns plan-space points plus the constant height, and the caller maps them
 * into its own axes. No renderer re-derives the shape.
 */

/** Plan-space direction of the four horizontal NESWUD faces. */
const DIR_VEC: Record<string, [number, number]> = {
  N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0],
};

/** Height above the floor plane. PoC: `z_arrow = 0.03`. */
export const ARROW_Z = 0.03;

/** PoC constants, named. Changing one is a canon change, not a tweak. */
export const ARROW = {
  /** tip, along the facing direction from the tile centre */
  tip: 0.36,
  /** where the head's base sits, along the facing direction */
  headBase: 0.06,
  /** half-width of the head */
  headHalf: 0.22,
  /** tail of the shaft, behind the tile centre */
  shaftTail: -0.34,
  /** half-width of the shaft */
  shaftHalf: 0.08,
} as const;

export interface ArrowPoint { x: number; y: number; }

export interface ArrowPolygon {
  /** 7 points: tip, head base left/right, shaft tail L/R, shaft head L/R. */
  points: ArrowPoint[];
  /** Triangles into `points`, front faces only — head, then two shaft tris. */
  triangles: [number, number, number][];
  /** Height above the floor. */
  z: number;
}

/**
 * The arrow for one opening, in PLAN space, centred on the tile in front of the
 * opening and pointing at the face.
 *
 * `cx`/`cy` are the opening's own cell; the arrow is drawn on that cell's
 * centre (`+0.5`), which is the tile the player stands on to use the door.
 */
export function arrowPolygon(cx: number, cy: number, dir: string): ArrowPolygon | null {
  const vec = DIR_VEC[dir];
  if (!vec) return null;                   // U / D have no facing arrow
  const [dx, dy] = vec;
  const px = -dy, py = dx;                 // perpendicular
  const mx = cx + 0.5, my = cy + 0.5;

  const at = (along: number, across: number): ArrowPoint => ({
    x: mx + dx * along + px * across,
    y: my + dy * along + py * across,
  });

  const points: ArrowPoint[] = [
    at(ARROW.tip, 0),                                    // 0 tip
    at(ARROW.headBase, -ARROW.headHalf),                 // 1 head base L
    at(ARROW.headBase, ARROW.headHalf),                  // 2 head base R
    at(ARROW.shaftTail, -ARROW.shaftHalf),               // 3 shaft tail L
    at(ARROW.shaftTail, ARROW.shaftHalf),                // 4 shaft tail R
    at(ARROW.headBase, -ARROW.shaftHalf),                // 5 shaft head L
    at(ARROW.headBase, ARROW.shaftHalf),                 // 6 shaft head R
  ];

  // PoC: head = (0,1,2); shaft = (3,4,6) + (3,6,5).
  const triangles: [number, number, number][] = [[0, 1, 2], [3, 4, 6], [3, 6, 5]];

  return { points, triangles, z: ARROW_Z };
}

/**
 * Both windings of a polygon's triangles — the PoC draws each arrow
 * double-sided (`tris.extend([(a, c, b) for a, b, c in tri])`) so it reads from
 * above and from below the floor plane alike.
 */
export function doubleSided(
  triangles: [number, number, number][],
): [number, number, number][] {
  return [...triangles, ...triangles.map(([a, b, c]) => [a, c, b] as [number, number, number])];
}
