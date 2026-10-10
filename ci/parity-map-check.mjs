// The VIZ PARITY MAP is a contract, not prose: every artefact it names must
// exist, and every claim about a gate must be true. A map that rots is worse
// than no map — the next session trusts it and re-derives a formula that is
// already implemented. This gate keeps it honest.
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(root);
const map = readFileSync(join(root, "docs/VIZ-PARITY-MAP.md"), "utf8");
let fail = 0;
const log = (ok, name, detail = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}`);
};

// 1. Every gate the map points at must exist and be wired into check.sh.
const check = readFileSync(join(root, "scripts/check.sh"), "utf8");
for (const g of ["ci/nt1-matrix.mjs", "ci/dollhouse-matrix.mjs",
                 "ci/box-vs-shape-matrix.mjs", "ci/oracle-crosscheck.mjs",
                 "ci/engine-checks.mjs", "ci/surface-fp.mjs"]) {
  log(existsSync(join(root, g)), `gate exists: ${g}`);
  if (g !== "ci/surface-fp.mjs")            // surface-fp runs via the viz guard
    log(check.includes(g.replace("ci/", "")), `wired into check.sh: ${g}`);
}
log(existsSync(join(repo, "viz/tests/test_canon_parity.py")), "gate exists: viz/tests/test_canon_parity.py");

// 2. Every source file the map cites must exist.
for (const f of ["viz/live/hubzz_render_pipeline.py", "viz/docs/FORMULAS.md",
                 "viz/docs/ARCHITECTURE.md", "network-lab/engine/space-shape.ts",
                 "network-lab/engine/space-spine.ts", "src/app/zone/constants.tsx",
                 "network-lab/spacetime/src/lib.rs"]) {
  log(existsSync(join(repo, f)), `cited source exists: ${f}`);
}

// 3. Every engine symbol the map names must actually be exported.
const engine = readFileSync(join(root, "engine/space-shape.ts"), "utf8");
for (const sym of ["handshakeStream", "handshakeFingerprint", "spaceSurfaceFingerprint",
                   "computeSpaceShape", "typedBoundaryFaces", "synthesizeShellWalls",
                   "perimeterCells", "walkableHeights", "canStep",
                   "dollhouseFaceHidden", "dollhouseVisibleFaces", "dollhouseHiddenDirs",
                   "encodeNeswudBitmask", "decodeNeswudBitmask", "boundaryFaceKey"]) {
  log(new RegExp(`export (function|const) ${sym}\\b`).test(engine), `engine exports: ${sym}`);
}

// 4. The KNOWN GAPS must still be gaps. If one is closed, the map is stale and
//    must be updated in the same change that closed it.
const skin = readFileSync(join(repo, "src/components/zone/ThreeScene.tsx"), "utf8");
// Gap 1 was CLOSED by the U/D duality ruling: the skin now BUILDS U meshes and
// lets the per-camera cutaway govern them, so stage 3's resurrected tops become
// geometry. Assert the closure holds rather than the gap — a re-introduced skip
// would silently restore the 16-surface divergence from the viz.
log(!/if \(face\.dir === 'U'\) continue;/.test(skin),
  "gap 1 CLOSED: the skin no longer drops U faces before building meshes");
log(/face\.dir === 'D' \|\| face\.dir === 'U'/.test(skin),
  "gap 1 closure: a visible top takes the FLOOR material (U-from-above is floor)");
log(engine.includes("return [...shell, ...upFaces"),
  "gap 1 mechanism intact: stage 3 only appends U, never alters a wall");

// 4a. The zone edge reserve was gap 2 and is now CLOSED — enforced on the
//     authoring path, deliberately absent from the shape gate. Both halves of
//     that layering are asserted here, because closing it the WRONG way (inside
//     validateUploadedSpace) breaks every origin-anchored oracle fixture. The
//     map must describe it as closed, not as a gap.
{
  const gate = readFileSync(join(root, "engine/space-gate.ts"), "utf8");
  log(!/INSET_SIZE|zoneEdgeReserveViolations|ZONE_EDGE_RESERVE/.test(gate),
    "reserve: the SHAPE gate stays placement-blind (space-gate.ts knows no reserve)");
  const authoring = readFileSync(join(repo, "src/app/zone/validation.ts"), "utf8");
  log(/zoneEdgeReserveViolations\s*\(/.test(authoring),
    "reserve: the AUTHORING path enforces it (src/app/zone/validation.ts)");
  const constants = readFileSync(join(root, "engine/core/constants.ts"), "utf8");
  log(/ZONE_ROAD_WIDTH/.test(constants) && /ZONE_SIDEWALK_WIDTH/.test(constants)
      && /ZONE_EDGE_RESERVE\s*=\s*ZONE_ROAD_WIDTH \+ ZONE_SIDEWALK_WIDTH/.test(constants),
    "reserve: both parts are named and summed, never a bare inset");
  log(!/gap 2|not yet in the TS publish gate/i.test(map),
    "reserve: the map no longer lists it as a gap");
}

// 4b. The 2-block headroom threshold is safety-critical and was ALREADY stated
//     loosely once: ruling 17 led with the collapsed `floor := exposed U face`
//     and the map omitted the threshold entirely. A U face is walkable only
//     with air at y AND y+1; the collapse holds solely under the solid-stack
//     authoring invariant. Losing the precondition would make every roof tile
//     walkable even with a space stacked on it, and would delete the balcony
//     distinction, which IS that residue. Assert the docs and the code agree.
{
  const ledger = readFileSync(join(root, "docs/CANON-LEDGER.md"), "utf8");
  const engineSrc = readFileSync(join(root, "engine/space-shape.ts"), "utf8");
  log(/below && !at && !above/.test(engineSrc),
    "engine still requires 2-block headroom (below && !at && !above)");
  for (const [name, text] of [["CANON-LEDGER ruling 17", ledger], ["VIZ-PARITY-MAP", map]]) {
    log(/z\+1[^.]{0,40}z\+2|air at y AND y\+1|2-block headroom/i.test(text),
      `${name} states the 2-block headroom threshold`);
    log(/solid-stack authoring invariant/i.test(text),
      `${name} names the precondition for the collapsed form`);
  }
}

// 5. The map must name the parked items, so nobody resolves one by accident.
for (const parked of ["roof", "balcony", "cut-capping"]) {
  log(map.toLowerCase().includes(parked), `map names the parked item: ${parked}`);
}

console.log(fail === 0
  ? "\nPARITY MAP: consistent with the code it describes"
  : `\nPARITY MAP: ${fail} claim(s) no longer true — update docs/VIZ-PARITY-MAP.md`);
process.exit(fail === 0 ? 0 : 1);
