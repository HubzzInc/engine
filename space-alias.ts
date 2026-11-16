/**
 * Space-id alias law (owner, 2026-11-14; ADR 0010, CANON-LEDGER ruling 22).
 *
 * A place's space id is `namespace:slug`. The namespace is the permanent
 * place (a project or a zone); the slug is the part within it. Precedent:
 * `cattown:outside`.
 *
 * Ids are never renamed. A retired id stays frozen and `resolveSpaceId`
 * walks `SPACE_ALIASES` to the canonical id. This table is the namespace
 * move off `bms:` onto `conference:`. Outdoor area is the single outside
 * space (`bms:outside` -> `conference:outside`).
 *
 * The grammar is a subset of `SAFE_SPACE_ID`
 * (`/^[A-Za-z0-9_:,-]{1,128}$/`, the charset the pre-alpha SQL boundary
 * accepts in `stdbSpaces.ts`). The colon is the separator, so a segment
 * has no colon and no comma. Two other engine id laws are not this
 * grammar and pass through the resolver unchanged:
 *
 * - `zone:<x>:<y>:public-remainder` (`remainderSpaceId` in space-links.ts)
 * - `prefix_<12 hex>` deterministic ids and the `net1:` FNV-1a mint id
 *   (commit 8996c0fd; `deterministicSpaceId` in core/schemas.ts, the FNV
 *   collision note in space-shape.ts)
 *
 * `structure_id` is copied verbatim. Ownership and identity stay the
 * ADR 0006 debt. Neither is this module.
 *
 * The Rust mirror in `spacetime/src/lib.rs` is required before any
 * Maincloud write. This module does not publish and does not rewrite rows.
 */

/** Charset and length the SQL boundary accepts. Every grammar id matches it. */
export const SAFE_SPACE_ID = /^[A-Za-z0-9_:,-]{1,128}$/;

/** `namespace:slug` is at least `a:b`. */
export const SPACE_ID_MAX_LENGTH = 128;

/** A segment is the SAFE charset with `:` reserved as the one separator
 *  and `,` left out — no settled space id uses a comma. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface ParsedSpaceId {
  namespace: string;
  slug: string;
}

export type SpaceAliasMap = Readonly<Record<string, string>>;

export function parseSpaceId(id: string): ParsedSpaceId | null {
  if (typeof id !== "string") return null;
  if (id.length < 3 || id.length > SPACE_ID_MAX_LENGTH) return null;
  if (!SAFE_SPACE_ID.test(id)) return null;
  const colon = id.indexOf(":");
  if (colon <= 0 || colon !== id.lastIndexOf(":")) return null;
  const namespace = id.slice(0, colon);
  const slug = id.slice(colon + 1);
  if (!SEGMENT.test(namespace) || !SEGMENT.test(slug)) return null;
  return { namespace, slug };
}

export function isSpaceId(id: string): boolean {
  return parseSpaceId(id) !== null;
}

/**
 * Retired id -> canonical id. One hop. Resolution is exact: `bms:lounge_W`
 * is not `bms:lounge_w`, and nothing rewrites `_` to `-` outside this table.
 *
 * `bms:outside` is included. The lab (`bmsOutside.ts`) keeps it local
 * because Maincloud has no row, and the prior dry-run skipped it for that
 * reason. The alias does not create the row. It records that the lab id
 * resolves to `conference:outside`, the same shape as `cattown:outside`.
 * The derived street remainder stays `remainderSpaceId`.
 *
 * `bms:roof_deck` and `bms:east_stair` were hallucinated by a previous AI. They are
 * not keys in this table (owner, 2026-11-14). Their live Maincloud
 * `space` / `space_scene` rows are hallucinated legacy rows to purge on
 * the owner's deploy cycle. This module does not write them.
 */
export const SPACE_ALIASES: SpaceAliasMap = Object.freeze({
  "bms:conference": "conference:auditorium",
  "bms:expo": "conference:expo",
  "bms:lounge_W": "conference:lounge-w",
  "bms:lounge_E": "conference:lounge-e",
  "bms:deck_lobby": "conference:deck-lobby",
  "bms:outside": "conference:outside",
});

export class SpaceAliasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceAliasError";
  }
}

function hasAlias(aliases: SpaceAliasMap, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(aliases, id);
}

/**
 * Walk retired -> canonical. An id that is not a key is returned unchanged,
 * so a canonical id is idempotent and so is a remainder or deterministic id.
 * A cycle throws `SpaceAliasError` instead of looping.
 * `resolve(resolve(id)) === resolve(id)` when resolve returns.
 */
export function resolveSpaceId(id: string, aliases: SpaceAliasMap = SPACE_ALIASES): string {
  if (typeof id !== "string") {
    throw new SpaceAliasError("space id must be a string");
  }
  const seen = new Set<string>();
  let current = id;
  for (;;) {
    if (!hasAlias(aliases, current)) return current;
    if (seen.has(current)) {
      throw new SpaceAliasError(
        `space-alias cycle at '${current}': ${[...seen, current].join(" -> ")}`,
      );
    }
    seen.add(current);
    const next = aliases[current];
    if (typeof next !== "string" || next.length === 0) {
      throw new SpaceAliasError(`space-alias for '${current}' is empty`);
    }
    current = next;
  }
}

export interface AliasMapIssue {
  code: "grammar" | "cycle";
  id: string;
  detail: string;
}

/** Pure check. Keys and values must be `namespace:slug`. Cycles are named. */
export function aliasMapIssues(aliases: SpaceAliasMap): AliasMapIssue[] {
  const issues: AliasMapIssue[] = [];
  for (const key of Object.keys(aliases)) {
    const to = aliases[key];
    if (!isSpaceId(key)) {
      issues.push({ code: "grammar", id: key, detail: "retired id is not namespace:slug" });
    }
    if (typeof to !== "string" || !isSpaceId(to)) {
      issues.push({
        code: "grammar",
        id: typeof to === "string" ? to : key,
        detail: `canonical target of '${key}' is not namespace:slug`,
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, stack: string[]): void => {
    if (visited.has(id) || typeof id !== "string") return;
    if (visiting.has(id)) {
      const at = stack.indexOf(id);
      issues.push({
        code: "cycle",
        id,
        detail: [...stack.slice(at), id].join(" -> "),
      });
      return;
    }
    if (!hasAlias(aliases, id)) {
      visited.add(id);
      return;
    }
    visiting.add(id);
    stack.push(id);
    const next = aliases[id];
    if (typeof next === "string") walk(next, stack);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const key of Object.keys(aliases)) walk(key, []);
  return issues;
}

/** Throw `SpaceAliasError` when `aliasMapIssues` is non-empty. */
export function assertAliasMap(aliases: SpaceAliasMap): void {
  const issues = aliasMapIssues(aliases);
  if (issues.length === 0) return;
  throw new SpaceAliasError(
    `invalid space-alias map: ${issues.map((i) => `${i.code} ${i.id} (${i.detail})`).join("; ")}`,
  );
}

assertAliasMap(SPACE_ALIASES);
