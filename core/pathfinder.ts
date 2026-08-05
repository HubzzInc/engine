/**
 * A* Pathfinder — pure function, no external state.
 *
 * Ported and cleaned up from network-lab/server/src/managers/Pathfinder.Manager.ts.
 * Original was a class that loaded walkability from a MySQL database and operated
 * on a flat 1D grid tied to global world dimensions.  This version:
 *   - Is a pure function: takes a walkability predicate, returns a path array
 *   - Operates on the horizontal (x, y) plane — Z is vertical in NESWUD
 *   - Supports orthogonal-only (default) or 8-directional movement
 *   - Returns the full raw path (start → end inclusive); caller can simplify
 *   - Returns [] when no path exists or start === end
 */

// =============================================================================
// TYPES
// =============================================================================

export interface GridPoint {
  x: number;
  y: number;
}

export interface PathfinderOptions {
  /** Allow diagonal movement. Default: false (orthogonal only). */
  diagonal?: boolean;
  /**
   * Optional cap on explored (closed) nodes. When the search has expanded
   * more than `maxNodes` cells without reaching the goal it early-outs and
   * returns the no-path result ([]). Guards a pathological query from
   * burning a CLI/server call (the upstream server (docs/MMO-PATTERNS.md A6) pathfinder node_limit pattern).
   * Default: undefined — unbounded, behavior identical to before.
   */
  maxNodes?: number;
  /** Optional edge law applied after both endpoint cells are walkable. */
  canTraverse?: (from: GridPoint, to: GridPoint) => boolean;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function nodeKey(x: number, y: number): string {
  return `${x},${y}`;
}

function manhattanH(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function chebyshevH(a: GridPoint, b: GridPoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

type AStarNode = {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent?: AStarNode;
};

// =============================================================================
// findPath
// =============================================================================

/**
 * Find the shortest path from `start` to `end` on an implicit grid.
 *
 * @param start       Starting grid coordinate.
 * @param end         Target grid coordinate.
 * @param isWalkable  Returns true when a cell at (x, y) can be traversed.
 * @param options     Optional: enable diagonal movement.
 * @returns           Array of GridPoints from start to end (inclusive).
 *                    Empty array if no path exists or start === end.
 */
export function findPath(
  start: GridPoint,
  end: GridPoint,
  isWalkable: (x: number, y: number) => boolean,
  options: PathfinderOptions = {}
): GridPoint[] {
  const { diagonal = false, maxNodes, canTraverse } = options;

  // Trivial case
  if (start.x === end.x && start.y === end.y) return [];

  // Guard: endpoints must be walkable
  if (!isWalkable(start.x, start.y) || !isWalkable(end.x, end.y)) return [];

  const heuristic = diagonal ? chebyshevH : manhattanH;

  const openSet = new Map<string, AStarNode>();
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
  };

  openSet.set(nodeKey(start.x, start.y), startNode);

  let foundNode: AStarNode | undefined;

  while (openSet.size > 0) {
    // Pick the open node with the lowest f score
    let current: AStarNode | undefined;
    for (const node of openSet.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    const currentKey = nodeKey(current.x, current.y);
    openSet.delete(currentKey);
    closedSet.add(currentKey);

    if (current.x === end.x && current.y === end.y) {
      foundNode = current;
      break;
    }

    // Node cap: too many cells expanded without reaching the goal — give up
    // and report no-path rather than burn the whole call (Lesson A6).
    if (maxNodes !== undefined && closedSet.size >= maxNodes) break;

    for (const neighbor of getNeighbors(current, diagonal)) {
      if (!isWalkable(neighbor.x, neighbor.y)) continue;
      if (
        canTraverse &&
        !canTraverse(
          { x: current.x, y: current.y },
          { x: neighbor.x, y: neighbor.y }
        )
      ) continue;
      const nKey = nodeKey(neighbor.x, neighbor.y);
      if (closedSet.has(nKey)) continue;

      // Diagonal moves cost √2, orthogonal moves cost 1
      const moveCost =
        neighbor.x !== current.x && neighbor.y !== current.y
          ? Math.SQRT2
          : 1;
      const tentativeG = current.g + moveCost;

      let neighborNode = openSet.get(nKey);
      if (!neighborNode) {
        neighborNode = {
          x: neighbor.x,
          y: neighbor.y,
          g: tentativeG,
          h: heuristic(neighbor, end),
          f: tentativeG + heuristic(neighbor, end),
          parent: current,
        };
        openSet.set(nKey, neighborNode);
      } else if (tentativeG < neighborNode.g) {
        neighborNode.g = tentativeG;
        neighborNode.f = tentativeG + neighborNode.h;
        neighborNode.parent = current;
      }
    }
  }

  if (!foundNode) return [];

  // Reconstruct full path
  const path: GridPoint[] = [];
  let node: AStarNode | undefined = foundNode;
  while (node) {
    path.push({ x: node.x, y: node.y });
    node = node.parent;
  }
  path.reverse();
  return path;
}

// =============================================================================
// INTERNAL: neighbour generation
// =============================================================================

const ORTHO_DIRS: GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const DIAG_DIRS: GridPoint[] = [
  ...ORTHO_DIRS,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

function getNeighbors(pos: GridPoint, diagonal: boolean): GridPoint[] {
  const dirs = diagonal ? DIAG_DIRS : ORTHO_DIRS;
  return dirs.map((d) => ({ x: pos.x + d.x, y: pos.y + d.y }));
}
