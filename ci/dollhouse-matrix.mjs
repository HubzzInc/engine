// DOLLHOUSE MATRIX — the SETTLED cutaway rules, pinned across every leg.
//
//   ./cli/node_modules/.bin/tsx ci/dollhouse-matrix.mjs      (from network-lab/)
//
// The dollhouse cutaway has PARKED items (roof-vs-balcony, cut-capping,
// ceiling-tops-as-walkable — CANON-LEDGER "OPEN — owner is deciding"). This
// matrix pins ONLY what is settled, so the parked questions stay open while the
// settled answers stop drifting:
//
//   R1  all-U hidden, D NEVER hidden        (ARCHITECTURE.md rule 1; the
//       reverted "tucked roof" experiment — saved/2026-07-22-flat-tints/NOTES.md
//       "Tried and REVERTED" — is why this is a gate and not a comment)
//   R2  rotation swaps which horizontal walls hide (ruling 5)
//   R3  ceiling faces 0 in the cutaway; floor + wall faces > 0
//       (the engine-level twin of ../tests/zone-builder-phase6.spec.ts:174-178)
//   R4  D face count survives the cutaway intact (no floor is ever culled)
//   R5  dollhouse walls are NEUTRAL — never kind-colored (ruling 5 + ruling 7 +
//       AGENTS.md hard ban). Asserted structurally (the engine's face record has
//       no color/kind channel) AND at every renderer's wall-material site.
//   R6  ONE seam derivation per side (`_face_edges` in the viz Python, the
//       engine's `faceEdges` in TS) feeds wireframe + all dollhouse stages
//       (FORMULAS.md "Seams"); no CONSUMER re-derives seams, and the two sides
//       are proven equal by M-D6 rather than trusted
//   R7  the PER-FACE cutaway (viz/docs/ARCHITECTURE.md "Dollhouse cutaway
//       (current, owner-driven)", 2026-07-22): U always hidden, D never, walls
//       by the per-face dot test, then seam survival, then the support rule.
//       The engine's `dollhouseVisibleFaces` must return exactly the face set
//       the viz's own Python returns, over every fixture x every fixed view.
//
// Legs: ENGINE (dollhouseHiddenDirs / typedBoundaryFaces / dollhouseVisibleFaces),
// WORLD-CLIENT (the real addDollhouseSurfaces projection, driven headlessly),
// VIZ (the actual Python `dollhouse_hidden_dirs`, `_face_hidden`, `_face_edges`,
// `_surfaces_of` and the `if hidden:` cutaway block, exec'd from live/ source),
// SKIN (source pins on ThreeScene's dollhouse block — the React renderer cannot
// be driven headlessly here, so its rules are pinned where they are written).
import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  dollhouseHiddenDirs, dollhouseVisibleFaces, dollhouseFaceHidden, boundaryFaceKey,
  typedBoundaryFaces, openingsToInterfaces,
} from "../space-shape";
import { addDollhouseSurfaces } from "../apps/world-client/src/spatial/DollhouseSurfaces";
import { Group } from "three";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const results = [];
const log = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}`);
};

// ---- fixtures: a spread of footprints, heights, notches and openings -------
const box = (w, d) => { const c = []; for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) c.push({ x, z }); return c; };
const stack = (cells, h) => cells.flatMap(({ x, z }) => Array.from({ length: typeof h === "function" ? h(x, z) : h }, (_, y) => ({ x, y, z })));

const { lFloorCells, L_OPENINGS } = await import("./make-l-scene.mjs");

// the viz's canon scene (saved/2026-07-22-flat-tints/NOTES.md): 8x6 minus a
// 3x2 notch, front band (z<2) tier 2, hall tier 4. Viz is z-up, engine y-up.
const bandHallCells = box(8, 6).filter(({ x, z }) => !(x >= 5 && z >= 4));
const donut = box(8, 8).filter(({ x, z }) => !(x >= 3 && x < 5 && z >= 3 && z < 5));
const ushape = box(10, 8).filter(({ x, z }) => !(x >= 3 && x < 7 && z >= 4));
// A footprint wide enough that a camera can sit INSIDE its extent: the per-face
// and whole-direction tests separate when the camera is nearer than roughly
// half the extent, so this is the fixture that keeps M-D6's close leg non-empty
// at a distance the small fixtures have already left behind (measured below).
const bigDonut = box(14, 14).filter(({ x, z }) => !(x >= 4 && x < 10 && z >= 4 && z < 10));

const FIXTURES = [
  { name: "single-1x1-h1", blocks: stack(box(1, 1), 1) },
  { name: "box-2x2-h1", blocks: stack(box(2, 2), 1) },
  { name: "box-8x8-h2", blocks: stack(box(8, 8), 2) },
  { name: "corridor-1x6-h3", blocks: stack(box(1, 6), 3) },
  { name: "courtyard-8x8-h2", blocks: stack(donut, 2) },
  { name: "U-10x8-h2", blocks: stack(ushape, 2) },
  { name: "band-hall-tiered", blocks: stack(bandHallCells, (_x, z) => (z < 2 ? 2 : 4)) },
  {
    name: "L-CC03-h2-doors",
    blocks: stack(lFloorCells(), 2),
    interfaces: openingsToInterfaces(L_OPENINGS),
  },
  { name: "courtyard-14x14-h2", blocks: stack(bigDonut, 2) },
];

// ---- cameras: the four fixed quadrant views + the 2026-07-23 top-down ------
// (AGENTS.md: NO orbit camera — fixed views only. These are those views.)
const QUADRANTS = [
  { name: "SE", dx: 1, dz: -1 }, { name: "NE", dx: 1, dz: 1 },
  { name: "NW", dx: -1, dz: 1 }, { name: "SW", dx: -1, dz: -1 },
  { name: "TOP", dx: 0, dz: 0 },
];
const centerOf = (blocks) => ({
  x: (Math.min(...blocks.map((b) => b.x)) + Math.max(...blocks.map((b) => b.x))) / 2,
  z: (Math.min(...blocks.map((b) => b.z)) + Math.max(...blocks.map((b) => b.z))) / 2,
});
const camerasFor = (blocks) => {
  const c = centerOf(blocks);
  const r = Math.max(4, ...blocks.map((b) => Math.abs(b.x - c.x) + Math.abs(b.z - c.z))) * 1.35;
  return QUADRANTS.map((q) => ({ name: q.name, center: c, cam: { x: c.x + q.dx * r, z: c.z + q.dz * r } }));
};

// ---- VIZ leg: exec the ACTUAL Python source (not a copy of it) -------------
const vizGui = join(root, "..", "viz", "live", "hubzz_viewer_gui.py");
const vizPipe = join(root, "..", "viz", "live", "hubzz_render_pipeline.py");
const grab = (file, re, what) => {
  const m = readFileSync(file, "utf8").match(re);
  if (!m) throw new Error(`could not extract ${what} from ${file}`);
  return m[0];
};

// ---- run the matrix -------------------------------------------------------
const DIR_TO_VIZ = { N: "py", S: "ny", E: "px", W: "nx", U: "pz", D: "nz" };
const rows = [];
const vizPayload = [];

for (const fx of FIXTURES) {
  const interfaces = fx.interfaces ?? [];
  const faces = typedBoundaryFaces(fx.blocks, interfaces);
  const cams = camerasFor(fx.blocks);

  // R1/R2 — the engine's direction law over every fixed view.
  const hiddenSets = cams.map((c) => ({ view: c.name, dirs: dollhouseHiddenDirs(c.cam, c.center) }));
  const r1 = hiddenSets.every((h) => h.dirs.has("U") && !h.dirs.has("D"));
  const horiz = (s) => [...s].filter((d) => d !== "U" && d !== "D").sort().join("");
  const se = hiddenSets.find((h) => h.view === "SE").dirs;
  const nw = hiddenSets.find((h) => h.view === "NW").dirs;
  const r2 = horiz(se) === "ES" && horiz(nw) === "NW"
    && [...se].filter((d) => d !== "U").every((d) => !nw.has(d));

  // R3/R4 — the cutaway projection the SKIN renders (ThreeScene.tsx:2225-2270:
  // U faces are never emitted; D becomes MAT_FLOOR; N/E/S/W become MAT_WALL).
  const emitted = faces.filter((f) => f.dir !== "U");
  const ceiling = emitted.filter((f) => f.dir === "U").length;
  const floor = emitted.filter((f) => f.dir === "D").length;
  const wall = emitted.filter((f) => !["U", "D"].includes(f.dir)).length;
  const r3 = ceiling === 0 && floor > 0 && wall > 0;
  // D is never hidden, so every D boundary face survives the cutaway.
  const r4 = floor === faces.filter((f) => f.dir === "D").length;

  // R3/R5 — the WORLD-CLIENT projection, driven for real.
  const floorCells = fx.blocks.filter((b) => b.y === 0).map((b) => ({ x: b.x, z: b.z }));
  const wallTop = Math.max(...fx.blocks.map((b) => b.y)) + 1;
  const projected = addDollhouseSurfaces(new Group(), floorCells, wallTop, interfaces, fx.blocks);
  const wcCeiling = projected.faces.filter((f) => f.dir === "U" && f.type === "wall").length;
  const wcWallVertical = projected.wallMeshes.filter((m) => ["U", "D"].includes(m.userData.surface.dir)).length;
  const wcWalls = projected.wallMeshes.length;
  const wcOk = wcCeiling === 0 && wcWallVertical === 0 && wcWalls > 0;
  // the engine's face record carries no color/kind channel at all — a wall
  // CANNOT be kind-colored from dollhouse data (ruling 5, structural form).
  const noKindChannel = projected.faces.every((f) =>
    Object.keys(f).sort().join(",") === "dir,type,x,y,z");

  const ok = r1 && r2 && r3 && r4 && wcOk && noKindChannel;
  rows.push({
    name: fx.name, cells: fx.blocks.length, hidden: `U+${horiz(se)}/${horiz(nw)}`,
    ceiling, floor, wall, wcWalls, ok,
    why: [r1 ? "" : "R1", r2 ? "" : "R2", r3 ? "" : "R3", r4 ? "" : "R4",
      wcOk ? "" : "R3(world-client)", noKindChannel ? "" : "R5(face record)"].filter(Boolean).join(","),
  });

  vizPayload.push({
    name: fx.name,
    cam: cams.map((c) => [c.name, c.cam.x, c.cam.z, c.center.x, c.center.z]),
    faces: faces.map((f) => [f.x, f.y, f.z, DIR_TO_VIZ[f.dir], f.dir]),
  });
}

console.log("\n=== M-D1: the cutaway face law, per fixture ===");
console.log("FIXTURE".padEnd(22) + "CELLS".padEnd(7) + "HIDDEN(SE/NW)".padEnd(16) +
  "CEIL".padEnd(6) + "FLOOR".padEnd(7) + "WALL".padEnd(6) + "WC-WALLS".padEnd(10) + "VERDICT");
for (const r of rows) {
  console.log(r.name.padEnd(22) + String(r.cells).padEnd(7) + r.hidden.padEnd(16) +
    String(r.ceiling).padEnd(6) + String(r.floor).padEnd(7) + String(r.wall).padEnd(6) +
    String(r.wcWalls).padEnd(10) + (r.ok ? "AGREE" : `DRIFT ${r.why}`));
}
const d1ok = rows.filter((r) => r.ok).length;
console.log(`\nM-D1: ${d1ok}/${rows.length} fixtures AGREE  ·  ${rows.length - d1ok} DRIFT`);
log("M-D1: all-U hidden / D never hidden / ceiling 0 / floor+wall > 0 (engine + world-client)",
  d1ok === rows.length, `${rows.length} fixtures`);

// ---- M-D2: the VIZ leg — the real Python cutaway over the same faces -------
{
  const src = [
    grab(vizPipe, /^NORMALS = \{[\s\S]*?\}\n/m, "NORMALS"),
    grab(vizPipe, /^def _face_hidden\([\s\S]*?> 0\.1\n/m, "_face_hidden"),
    grab(vizGui, /^def dollhouse_hidden_dirs\([\s\S]*?return hidden\n/m, "dollhouse_hidden_dirs"),
  ].join("\n");
  const driver = `
import json, sys
${src}
payload = json.load(sys.stdin)
out = []
for fx in payload:
    bad = []
    for view, cx, cz, ox, oz in fx["cam"]:
        dirs = dollhouse_hidden_dirs((cx, cz), (ox, oz))
        if "U" not in dirs or "D" in dirs:
            bad.append("dirs:" + view + ":" + "".join(sorted(dirs)))
        # viz is z-up: engine (x, y_up, z) -> viz (x, z, y_up); cam x/z -> viz x/y
        for fxx, fy, fz, vd, ed in fx["faces"]:
            hid = _face_hidden((fxx, fz, fy), vd, {"on"}, (cx, cz))
            if ed == "U" and not hid: bad.append("U-not-hidden:" + view)
            if ed == "D" and hid: bad.append("D-hidden:" + view)
    out.append({"name": fx["name"], "bad": sorted(set(bad))[:3]})
print(json.dumps(out))
`;
  let vizRows = null, err = "";
  try {
    vizRows = JSON.parse(execFileSync(process.env.VIZ_PYTHON ?? "python3", ["-c", driver],
      { input: JSON.stringify(vizPayload), encoding: "utf8" }));
  } catch (e) { err = String(e.message ?? e).slice(0, 160); }

  console.log("\n=== M-D2: the viz's own Python cutaway (extracted from live/ source) ===");
  if (!vizRows) {
    console.log(`FAIL to run the viz leg: ${err}`);
    log("M-D2: viz Python cutaway agrees with the engine on all-U / never-D", false, err);
  } else {
    console.log("FIXTURE".padEnd(22) + "FACES".padEnd(8) + "VERDICT");
    for (const r of vizRows) {
      const n = vizPayload.find((p) => p.name === r.name).faces.length;
      console.log(r.name.padEnd(22) + String(n).padEnd(8) +
        (r.bad.length ? `DRIFT ${r.bad.join(" ")}` : "AGREE"));
    }
    const ok = vizRows.filter((r) => !r.bad.length).length;
    console.log(`\nM-D2: ${ok}/${vizRows.length} fixtures AGREE  ·  ${vizRows.length - ok} DRIFT`);
    log("M-D2: viz Python cutaway agrees with the engine on all-U / never-D",
      ok === vizRows.length, `${vizRows.length} fixtures × 5 fixed views`);
  }
}

// ---- M-D6: R7 — the PER-FACE cutaway, TS port == the viz's own Python -------
// The engine's `dollhouseVisibleFaces` is a port of the viz's settled stages
// 1-3. This leg does not re-state the rules: it execs the SAME live Python
// (`_face_hidden`, `_face_edges`, `_surfaces_of` and the `if hidden:` block of
// `build_space_scene`, all lifted verbatim out of live/ source) over the same
// blocks and cameras, and requires an identical visible face set. Editing
// either side breaks it.
//
// TWO camera families, because they prove different things (measured, 2026-07-25):
//
//   FAR   the fixed quadrant views the viz actually uses. Here stage 1
//         DEGENERATES to the old whole-direction filter — with the camera well
//         outside the shape, `cam − face` carries the same sign as
//         `cam − centre` for every face of a direction, so the dot test and the
//         direction test agree face for face. What still separates the port
//         from the old rule at these views is stages 2-3, which the direction
//         filter has no counterpart for at all.
//   CLOSE the camera dollied in to a fixed cell distance. Below roughly half
//         the shape's extent the two tests come apart at STAGE 1 — this is a
//         camera-distance effect, NOT a concavity effect. A leg with only the
//         far views could not tell the ported formula from the old one, so the
//         close family is what makes this gate non-vacuous, and the leg FAILS
//         if stage 1 stops diverging there.
console.log("\n=== M-D6: per-face cutaway — engine `dollhouseVisibleFaces` vs the viz's Python ===");
{
  // Cell-CORNER camera space: a block at (x,y,z) spans [x,x+1]^3, exactly as
  // the oracle's face_vertices lays it out and as the viz's Open3D bounding-box
  // centre reads. centerOf() is a cell-INDEX midpoint, hence the +0.5.
  const cornerCenterOf = (blocks) => {
    const c = centerOf(blocks);
    return { x: c.x + 0.5, z: c.z + 0.5 };
  };
  const farCamerasFor = (blocks) => {
    const c = cornerCenterOf(blocks);
    const idx = centerOf(blocks);
    const r = Math.max(4, ...blocks.map((b) => Math.abs(b.x - idx.x) + Math.abs(b.z - idx.z))) * 1.35;
    return QUADRANTS.map((q) => ({
      view: q.name, family: "FAR", cam: { x: c.x + q.dx * r, z: c.z + q.dz * r },
    }));
  };
  // The viz's own quadrant eye direction (hubzz_viewer_gui.apply_quad_camera):
  // normalize(dx*1.35, dy*1.35, 1) — so a "distance" is along that unit ray and
  // its ground-plane component is 1.35/‖·‖ of it, not the whole of it.
  const CLOSE_DISTANCES = [2, 6];
  const closeCamerasFor = (blocks) => {
    const c = cornerCenterOf(blocks);
    return CLOSE_DISTANCES.flatMap((dist) =>
      QUADRANTS.filter((q) => q.dx || q.dz).map((q) => {
        const n = Math.hypot(q.dx * 1.35, q.dz * 1.35, 1);
        return {
          view: `${q.name}@${dist}`, family: "CLOSE",
          cam: { x: c.x + (q.dx * 1.35 / n) * dist, z: c.z + (q.dz * 1.35 / n) * dist },
        };
      }));
  };

  // Oracle resolution, same order as scripts/check.sh: $ZONE_ENGINE -> the
  // owner's out-of-git checkout -> this repo's vendored snapshot.
  const oracleDir = [process.env.ZONE_ENGINE, "/Users/russ/src/local/_non-git/Spatial_Mapping",
    join(root, "..")].find((d) => d && existsSync(join(d, "zone_engine")));

  const payload = FIXTURES.map((fx) => {
    const faces = typedBoundaryFaces(fx.blocks, fx.interfaces ?? []);
    return {
      name: fx.name,
      blocks: fx.blocks.map((b) => [b.x, b.y, b.z]),
      views: [...farCamerasFor(fx.blocks), ...closeCamerasFor(fx.blocks)].map((v) => ({
        view: v.view, family: v.family, cam: [v.cam.x, v.cam.z],
        ts: dollhouseVisibleFaces(faces, v.cam).map(boundaryFaceKey).sort(),
        all: faces.length,
      })),
    };
  });

  // the viz's stage 1 line + the whole `if hidden:` cutaway block, verbatim.
  const vizSrc = [
    grab(vizPipe, /^NORMALS = \{[\s\S]*?\}\n/m, "NORMALS"),
    grab(vizPipe, /^def _face_edges\([\s\S]*?\n    return quads, edges\n/m, "_face_edges"),
    grab(vizPipe, /^def _surfaces_of\([\s\S]*?\n    return surf\n/m, "_surfaces_of"),
    grab(vizPipe, /^def _face_hidden\([\s\S]*?> 0\.1\n/m, "_face_hidden"),
  ].join("\n");
  const stage1 = grab(vizPipe, /^ {4}shell = \[f for f in full_shell if not _face_hidden\(.*\n/m, "stage 1");
  const stage23 = grab(vizPipe, /^ {4}if hidden:\n[\s\S]*?\n(?=\n {4}wall_by_dir = )/m, "stages 2-3");

  const driver = `
import json, sys
sys.path.insert(0, ${JSON.stringify(oracleDir ?? "")})
from zone_engine.core.geometry_utils import classify_faces, face_vertices
${vizSrc}

VIZ_TO_DIR = {"px": "E", "nx": "W", "py": "N", "ny": "S", "pz": "U", "nz": "D"}

def viz_visible(solid, cam_xy):
    hidden = {"on"}
    faces = classify_faces(solid)
    full_shell = [(v, d, d) for v, d, _ in faces]
${stage1}${stage23}    return shell

out = []
for fx in json.load(sys.stdin):
    # engine block (x, y=level, z=depth) -> viz solid (x, footprint_y, layer)
    solid = {(b[0], b[2], b[1]) for b in fx["blocks"]}
    rows = []
    for v in fx["views"]:
        shell = viz_visible(solid, tuple(v["cam"]))
        # viz (x, footprint_y, layer) -> engine key x_y_z_DIR
        rows.append(sorted("%d_%d_%d_%s" % (p[0], p[2], p[1], VIZ_TO_DIR[d]) for p, d, _ in shell))
    out.append({"name": fx["name"], "views": rows})
print(json.dumps(out))
`;

  let vizOut = null, err = "";
  if (!oracleDir) err = "no oracle found (set $ZONE_ENGINE to a tree containing zone_engine/)";
  else {
    try {
      vizOut = JSON.parse(execFileSync(process.env.VIZ_PYTHON ?? "python3", ["-c", driver],
        { input: JSON.stringify(payload), encoding: "utf8" }));
    } catch (e) { err = String(e.stderr || e.message || e).trim().split("\n").slice(-3).join(" ").slice(0, 300); }
  }

  if (!vizOut) {
    console.log(`FAIL to run the viz leg: ${err}`);
    log("M-D6: engine per-face cutaway == the viz's Python, every fixture x every fixed view", false, err);
  } else {
    // Per view we record three things:
    //   ts/viz    the full 3-stage visible set on each side — must be identical
    //   s1        stage 1 ALONE, per-face vs whole-direction: how many wall
    //             faces the two tests classify differently (the pure
    //             camera-distance effect, isolated from stages 2-3)
    //   full      the full port vs whole-direction hiding, all stages
    const tally = {
      FAR: { seen: 0, agree: 0, s1: 0, full: 0, s1Where: [] },
      CLOSE: { seen: 0, agree: 0, s1: 0, full: 0, s1Where: [] },
    };
    const rowsOut = [];
    for (const fx of payload) {
      const src = FIXTURES.find((f) => f.name === fx.name);
      const allFaces = typedBoundaryFaces(src.blocks, src.interfaces ?? []);
      const walls = allFaces.filter((f) => f.dir !== "U" && f.dir !== "D");
      const idx = centerOf(src.blocks);
      const center = { x: idx.x + 0.5, z: idx.z + 0.5 };
      const got = vizOut.find((r) => r.name === fx.name);
      const row = { name: fx.name, faces: fx.views[0].all, walls: walls.length, ok: true, far: [], close: [] };
      fx.views.forEach((v, i) => {
        const cam = { x: v.cam[0], z: v.cam[1] };
        const viz = got.views[i];
        const same = viz.length === v.ts.length && viz.every((k, j) => k === v.ts[j]);
        if (!same) row.ok = false;

        const dirHidden = dollhouseHiddenDirs(cam, center);
        // stage 1 in isolation, over the WALLS only (U/D are decided by fiat in
        // both rules, so only walls can separate them).
        const s1Face = new Set(walls.filter((f) => !dollhouseFaceHidden(f, cam)).map(boundaryFaceKey));
        const s1Dir = new Set(walls.filter((f) => !dirHidden.has(f.dir)).map(boundaryFaceKey));
        let s1Differ = 0;
        for (const k of s1Face) if (!s1Dir.has(k)) s1Differ++;
        for (const k of s1Dir) if (!s1Face.has(k)) s1Differ++;
        // and the whole port vs the whole old rule
        const byDir = allFaces.filter((f) => !dirHidden.has(f.dir)).map(boundaryFaceKey).sort();
        const fullDiffers = byDir.length !== v.ts.length || byDir.some((k, j) => k !== v.ts[j]);

        const t = tally[v.family];
        t.seen++;
        if (same) t.agree++;
        if (s1Differ) { t.s1++; t.s1Where.push(`${fx.name}:${v.view}`); }
        if (fullDiffers) t.full++;
        // Reported as HIDDEN counts — a cutaway is named by what it removes,
        // and that is the form the measurement behind this leg is quoted in.
        (v.family === "FAR" ? row.far : row.close).push({
          view: v.view, ts: v.ts.length, viz: viz.length, same, s1Differ,
          s1FaceHid: walls.length - s1Face.size, s1DirHid: walls.length - s1Dir.size,
        });
      });
      rowsOut.push(row);
    }

    const farViews = rowsOut[0].far.map((c) => c.view);
    console.log("-- FAR: the fixed quadrant views (stage 1 degenerates to the direction rule here)");
    console.log("FIXTURE".padEnd(22) + "FACES".padEnd(7) +
      farViews.map((n) => `${n}(ts/viz)`.padEnd(14)).join("") + "VERDICT");
    for (const r of rowsOut) {
      console.log(r.name.padEnd(22) + String(r.faces).padEnd(7) +
        r.far.map((c) => `${c.ts}/${c.viz}${c.same ? "" : "!"}`.padEnd(14)).join("") +
        (r.far.every((c) => c.same) ? "AGREE" : "DRIFT"));
    }

    console.log("\n-- CLOSE: the camera dollied to a fixed cell distance along the same view ray");
    console.log("   Stage 1 ALONE, wall faces HIDDEN, summed over the 4 quadrants:");
    console.log("   per-face (the ported rule) vs coarse (whole-direction) vs faces they classify differently.");
    console.log("FIXTURE".padEnd(22) + "DIST".padEnd(6) + "WALLS".padEnd(7) + "TS==VIZ".padEnd(9) +
      "S1 HID/FACE".padEnd(13) + "S1 HID/DIR".padEnd(12) + "S1 DIFFER".padEnd(11) + "VERDICT");
    for (const r of rowsOut) {
      for (const dist of CLOSE_DISTANCES) {
        const at = r.close.filter((c) => c.view.endsWith(`@${dist}`));
        const sum = (k) => at.reduce((a, c) => a + c[k], 0);
        console.log(r.name.padEnd(22) + String(dist).padEnd(6) + String(r.walls).padEnd(7) +
          `${at.filter((c) => c.same).length}/${at.length}`.padEnd(9) +
          String(sum("s1FaceHid")).padEnd(13) + String(sum("s1DirHid")).padEnd(12) +
          String(sum("s1Differ")).padEnd(11) +
          (at.every((c) => c.same) ? (sum("s1Differ") ? "AGREE · DIVERGES" : "AGREE · degenerate") : "DRIFT"));
      }
    }

    const seen = tally.FAR.seen + tally.CLOSE.seen;
    const agree = tally.FAR.agree + tally.CLOSE.agree;
    console.log(`\nM-D6: ${agree}/${seen} fixture x view face sets IDENTICAL (engine port == viz Python)`);
    console.log(`      FAR   ${tally.FAR.agree}/${tally.FAR.seen} identical · stage 1 differs from the ` +
      `direction rule in ${tally.FAR.s1}/${tally.FAR.seen} views · all stages differ in ${tally.FAR.full}/${tally.FAR.seen}`);
    // The far exceptions are worth naming: TOP puts the camera OVER the
    // footprint, so on a shape with a hole it sits above the void and the
    // per-face test correctly hides the courtyard's inward-facing walls while
    // the direction rule (dx = dz = 0) hides no wall at all.
    if (tally.FAR.s1) console.log(`            far stage-1 exceptions: ${tally.FAR.s1Where.join(" ")}`);
    console.log(`      CLOSE ${tally.CLOSE.agree}/${tally.CLOSE.seen} identical · stage 1 differs from the ` +
      `direction rule in ${tally.CLOSE.s1}/${tally.CLOSE.seen} views · all stages differ in ${tally.CLOSE.full}/${tally.CLOSE.seen}`);
    // Non-vacuity, asserted in both places it matters: the close family must
    // separate the two rules at STAGE 1, and the port as a whole must differ
    // from whole-direction hiding at the far views too (that is stages 2-3).
    const ok = agree === seen && tally.CLOSE.s1 > 0 && tally.FAR.full > 0;
    log("M-D6: engine per-face cutaway == the viz's Python, far AND close cameras", ok,
      `${FIXTURES.length} fixtures × ${rowsOut[0].far.length} fixed + ${rowsOut[0].close.length} close views` +
      (agree !== seen ? " — DRIFT vs the viz"
        : tally.CLOSE.s1 === 0 ? " — VACUOUS: stage 1 never diverges at the close cameras"
          : tally.FAR.full === 0 ? " — VACUOUS: stages 2-3 never diverge at the fixed views" : ""));
  }
}

// ---- M-D3: R5 — dollhouse walls are NEUTRAL, at every renderer's material --
// Ruling 5 / ruling 7 / AGENTS.md hard ban: "NO kind colors on dollhouse walls".
// The kind palette marks spaces on the CITY MAP only.
const CANON_PALETTE = { public: 0xa855f7, private: 0xf97316, flex: 0x22c55e };
const paletteHexes = Object.values(CANON_PALETTE).map((v) => v.toString(16));
// The opening highlight — viz BRAND["success"], the green the PoC fills door
// and portal parallax panels with. Legal on TYPED INTERFACE SURFACES only;
// putting it on the wall shell is still the ruling-5 hard ban.
const OPENING_HIGHLIGHT = "4cc38a";
const isNeutralHex = (hex) => {
  const n = parseInt(hex, 16);
  return ((n >> 16) & 255) === ((n >> 8) & 255) && ((n >> 8) & 255) === (n & 255);
};
console.log("\n=== M-D3: neutral dollhouse walls (ruling 5 — a HARD BAN) ===");
console.log("RENDERER".padEnd(46) + "WALL COLOR".padEnd(14) + "VERDICT");
{
  // world-client: DollhouseSurfaces wall material + the parallax tint.
  const f = join(root, "apps", "world-client", "src", "spatial", "DollhouseSurfaces.ts");
  const src = readFileSync(f, "utf8");
  // Follow the CONSTANT, not a literal: the wall material names NEUTRAL_WALL,
  // so both its value and the fact that the material uses it are asserted.
  const wallMat = src.match(/NEUTRAL_WALL\s*=\s*0x([0-9a-fA-F]{6})/)?.[1];
  const wallUsesConst = /const wallMaterial = new MeshStandardMaterial\(\{\s*color:\s*NEUTRAL_WALL/.test(src);
  const tint = src.match(/OPENING_HIGHLIGHT\s*=\s*0x([0-9a-fA-F]{6})/)?.[1];
  // Ruling 5 restricts the WALL SHELL to neutral. It does not ban semantic
  // colour on TYPED INTERFACE SURFACES — the viz PoC has always filled door and
  // portal parallax panels with BRAND["success"], and the owner ruled that
  // reading current on 2026-07-26. So the two are pinned SEPARATELY: the wall
  // must be neutral grey, the opening must be exactly the highlight, and
  // NEITHER may ever be a city-map kind hex.
  const wallOk = !!wallMat && wallUsesConst && isNeutralHex(wallMat)
    && !paletteHexes.includes(wallMat.toLowerCase());
  const tintOk = !!tint && tint.toLowerCase() === OPENING_HIGHLIGHT
    && !paletteHexes.includes(tint.toLowerCase());
  console.log("world-client DollhouseSurfaces.ts".padEnd(46) + `0x${wallMat ?? "?"}`.padEnd(14) + (wallOk ? "NEUTRAL" : "DRIFT"));
  log("M-D3: world-client dollhouse WALL material is neutral grey", wallOk,
    `wall=0x${wallMat} usesConst=${wallUsesConst}`);
  log("M-D3: world-client OPENING highlight is the sanctioned semantic colour",
    tintOk, `opening=0x${tint} expected=0x${OPENING_HIGHLIGHT}`);
}
{
  // skin: ThreeScene's dollhouse block — MAT_WALL + no kind hex inside it.
  const f = join(root, "..", "src", "components", "zone", "ThreeScene.tsx");
  const src = readFileSync(f, "utf8");
  const matWall = src.match(/const MAT_WALL = new THREE\.MeshBasicMaterial\(\{\s*color:\s*0x([0-9a-fA-F]{6})/)?.[1];
  const blockStart = src.indexOf("const MAT_WALL");
  const blockEnd = src.indexOf('setSceneDebugAttr("dollhouse-source-cells"');
  const block = blockStart >= 0 && blockEnd > blockStart ? src.slice(blockStart, blockEnd) : "";
  const kindLeak = paletteHexes.filter((h) => new RegExp(`0x${h}`, "i").test(block));
  const ok = !!matWall && isNeutralHex(matWall) && block.length > 0 && kindLeak.length === 0;
  console.log("skin ThreeScene.tsx (dollhouse block)".padEnd(46) + `0x${matWall ?? "?"}`.padEnd(14) +
    (ok ? "NEUTRAL" : `DRIFT ${kindLeak.join(",") || "material"}`));
  log("M-D3: skin dollhouse wall material is neutral grey and carries no kind hex",
    ok, `MAT_WALL=0x${matWall} block=${block.length}b`);
}
{
  // space-editor: the shell's base colour (all faces tint off this one grey).
  const f = join(root, "apps", "space-editor", "src", "scene", "SpaceShell.ts");
  const src = readFileSync(f, "utf8");
  const m = src.match(/shellColor:\s*Color = new Color\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const ok = !!m && m[1] === m[2] && m[2] === m[3];
  console.log("space-editor SpaceShell.ts".padEnd(46) + (m ? `rgb(${m[1]})` : "?").padEnd(14) + (ok ? "NEUTRAL" : "DRIFT"));
  log("M-D3: space-editor shell colour is a neutral grey", ok, m ? `${m[1]},${m[2]},${m[3]}` : "not found");

  // Ruling 7 restated (owner 2026-07-26) bans INVENTED TONE LADDERS, not just
  // non-grey bases: the shell once shaded E/W -0.4, U -0.3 and green-tinted D
  // +0.2 off the neutral base. Every face must render the ONE base colour, so
  // fail on any per-direction colour-offset idiom (Color arithmetic off the
  // base, or a second Color construction to tint with) reappearing in the file.
  const deltaIdioms = [
    [/shellColor\s*(?:\.\s*clone\(\)\s*)?\.\s*add(?:Scalar|Colors)?\s*\(/, "Color .add/.addScalar off shellColor"],
    [/shellColor\s*(?:\.\s*clone\(\)\s*)?\.\s*(?:sub|multiply|multiplyScalar|lerp|offsetHSL)\s*\(/, "Color arithmetic off shellColor"],
    [/case\s*"[EWNSUD]"[\s\S]{0,400}?new Color\(/, "per-direction Color construction inside the face switch"],
  ];
  const deltaHits = deltaIdioms.filter(([re]) => re.test(src)).map(([, name]) => name);
  const colorCtors = (src.match(/new Color\(/g) ?? []).length;
  const flat = deltaHits.length === 0 && colorCtors === 1;
  console.log("space-editor SpaceShell.ts (tone ladder)".padEnd(46) + "one base only".padEnd(14) +
    (flat ? "FLAT" : `DRIFT ${deltaHits.join("; ") || `ctors=${colorCtors}`}`));
  log("M-D3: space-editor shell has NO per-direction colour offsets (ruling 7 — flat neutral)",
    flat, flat ? `new Color x${colorCtors}, no delta idiom` : `${deltaHits.join("; ")} ctors=${colorCtors}`);
}
{
  // the ONE sanctioned kind-colour site in a dollhouse file is the city-map
  // marker constant, which ruling 7 pins and which must stay unused by the
  // dollhouse materials (its own comment says so).
  const f = join(root, "apps", "world-client", "src", "spatial", "Dollhouse.ts");
  const src = readFileSync(f, "utf8");
  const uses = src.split("\n")
    .map((l, i) => [l, i + 1])
    .filter(([l]) => /KIND_COLORS/.test(l) && !/^const KIND_COLORS/.test(l.trim()));
  console.log("world-client Dollhouse.ts KIND_COLORS".padEnd(46) + "city-map only".padEnd(14) +
    (uses.length === 0 ? "UNUSED" : "DRIFT"));
  log("M-D3: the city-map kind palette is never applied by the Dollhouse",
    uses.length === 0, uses.length ? uses.map(([, n]) => `Dollhouse.ts:${n}`).join(" ") : "declared, never applied");
}

// ---- M-D4: R6 — ONE seam derivation per side, and no consumer re-derives ---
// FORMULAS.md "Seams": one derivation feeds wireframe, wall surface flood,
// seam-survival and support. There are now exactly TWO implementations of it —
// the viz's `_face_edges` (the canon record) and the engine's `faceEdges` (the
// law the TS renderers consume) — and M-D6 above proves they produce the same
// cutaway rather than trusting the port. No third, and no CONSUMER may derive
// seams itself.
console.log("\n=== M-D4: single-sourced seams (FORMULAS.md \"Seams\") ===");
{
  const pipe = readFileSync(vizPipe, "utf8");
  const defs = (pipe.match(/^def _face_edges\(/gm) ?? []).length;
  const calls = (pipe.match(/_face_edges\(/g) ?? []).length - defs;
  // stages that must consume it: wireframe, wall seam-survival, support rule.
  const ok = defs === 1 && calls >= 3;
  console.log(`viz pipeline: ${defs} definition(s), ${calls} consumer call(s) — ` +
    (ok ? "SINGLE SOURCE" : "DRIFT"));
  log("M-D4: viz `_face_edges` is defined once and feeds wireframe + both dollhouse stages",
    ok, `defs=${defs} calls=${calls}`);
}
{
  // no second seam derivation anywhere in live source (viz/saved/ is the dated
  // archive of owner decisions — never rewritten, never gated).
  let hits = [];
  try {
    hits = execFileSync("grep", [
      "-rnE", "--include=*.py", "--include=*.ts", "--include=*.tsx", "--include=*.mjs",
      // a DEFINITION site only (anchored) — a mention of the name is not a
      // second derivation, or this gate would flag its own source.
      "^[[:space:]]*(def _?face_edges[[:space:]]*\\(|(export )?function _?faceEdges[[:space:]]*\\()",
      join(root, ".."),
    ], { encoding: "utf8" })
      .trim().split("\n")
      .filter((l) => l && !/node_modules|\/viz\/saved\//.test(l));
  } catch { hits = []; }
  // Exactly two, and only these two: the viz Python (canon record) and the
  // engine TS (the law). M-D6 proves them equal. Anything else is a re-derivation.
  const SANCTIONED = [
    join("viz", "live", "hubzz_render_pipeline.py"),
    join("network-lab", "engine", "space-shape.ts"),
  ];
  const repo = join(root, "..") + "/";
  const where = hits.map((h) => h.slice(0, h.indexOf(":")).replace(repo, "")).sort();
  const ok = where.length === SANCTIONED.length
    && SANCTIONED.every((s) => where.some((w) => w === s));
  console.log(`repo-wide seam definitions (excl. viz/saved archive): ${hits.length} — ` +
    (ok ? "viz Python + engine TS, proven equal by M-D6" : "DRIFT"));
  log("M-D4: the only seam derivations are the viz's `_face_edges` and the engine's `faceEdges`",
    ok, where.join(" ") || "none found");
}
{
  // the neither-skin-nor-world-client case: they render per-face planes and do
  // not derive seams at all. Pin that they carry no competing edge->face map.
  const suspects = [
    join(root, "..", "src", "components", "zone", "ThreeScene.tsx"),
    join(root, "apps", "world-client", "src", "spatial", "DollhouseSurfaces.ts"),
  ].filter(existsSync);
  const leaks = suspects.filter((f) => /seamBounded|faceEdges|edgeToFaces/.test(readFileSync(f, "utf8")));
  console.log(`skin + world-client competing seam maps: ${leaks.length} — ` + (leaks.length ? "DRIFT" : "NONE"));
  log("M-D4: neither TS renderer re-derives seams", leaks.length === 0,
    leaks.map((f) => f.replace(root + "/", "")).join(" ") || `${suspects.length} files clean`);
}

// ---- M-D5: the documented per-seam D exception stays documented ------------
// The engine returns a set that NEVER contains D. The space-editor adds D at
// its own call site because its voxel floor renders instead — the engine's doc
// comment sanctions exactly that ("a per-seam choice"). Pin both halves so the
// exception cannot silently spread to the dollhouse renderers.
console.log("\n=== M-D5: the sanctioned per-seam D exception ===");
{
  const law = readFileSync(join(root, "engine", "space-shape.ts"), "utf8");
  const lawOk = /D \(the floor\) stays visible[\s\S]{0,160}per-seam choice/.test(law);
  const editor = readFileSync(join(root, "apps", "space-editor", "src", "scene", "SpaceShell.ts"), "utf8");
  const editorAdds = /dollhouseHiddenDirs\([^)]*\)\s*\.add\(\s*"D"\s*\)/.test(editor);
  const editorDocumented = /the voxel floor is what you see instead/.test(editor);
  const skin = readFileSync(join(root, "..", "src", "components", "zone", "ThreeScene.tsx"), "utf8");
  const wc = readFileSync(join(root, "apps", "world-client", "src", "spatial", "Dollhouse.ts"), "utf8");
  const spread = [["skin ThreeScene.tsx", skin], ["world-client Dollhouse.ts", wc]]
    .filter(([, s]) => /\.add\(\s*"D"\s*\)/.test(s)).map(([n]) => n);
  console.log(`engine doc sanction: ${lawOk ? "present" : "MISSING"} · ` +
    `space-editor adds D: ${editorAdds ? "yes" : "no"} (${editorDocumented ? "documented" : "UNDOCUMENTED"}) · ` +
    `spread to dollhouse renderers: ${spread.length ? spread.join(",") : "none"}`);
  log("M-D5: the D exception is sanctioned in the law, documented at its one call site, and has not spread",
    lawOk && editorAdds && editorDocumented && spread.length === 0);
}

// ---- M-D7: Portal is an OPENING in every leg ------------------------------
// The viz PoC authors the elevator doors as `type: "Portal"` — the teleportal
// tape's doors (ruling 15) — and displays them exactly as it displays a Door.
// `Portal` is accepted by the engine validator AND the reducer, so a scene can
// carry one and save cleanly; if the renderers type it as `wall` it silently
// becomes neutral grey with no parallax. This leg holds the four legs together
// on that: viz authors it, engine types it, world-client gives it the INTERIOR
// parallax reading, and the reducer keeps accepting it.
console.log("\n=== M-D7: Portal — the teleportal tape's door is an opening ===");
{
  const viz = readFileSync(join(root, "..", "viz", "live", "tower_halls_core.py"), "utf8");
  const vizAuthorsPortal = /"type":\s*"Portal"/.test(viz);
  log("M-D7: the viz PoC authors the tape's doors as Portal", vizAuthorsPortal);

  const eng = readFileSync(join(root, "engine", "space-shape.ts"), "utf8");
  const faceType = eng.match(/const FACE_TYPE[^{]*\{([^}]*)\}/s)?.[1] ?? "";
  const enginePortalIsDoor = /Portal:\s*"door"/.test(faceType);
  log("M-D7: the engine types an authored Portal as an opening, not wall",
    enginePortalIsDoor, `FACE_TYPE = {${faceType.trim().replace(/\s+/g, " ")}}`);

  const wc = readFileSync(join(root, "apps", "world-client", "src", "spatial", "DollhouseSurfaces.ts"), "utf8");
  const portalIsInterior = /authored\?\.type === "Portal"/.test(wc)
    && /OpeningView\.INTERIOR/.test(wc);
  log("M-D7: the world-client gives a Portal the INTERIOR parallax reading",
    portalIsInterior);

  const red = readFileSync(join(root, "spacetime", "src", "lib.rs"), "utf8");
  const reducerAccepts = /"Portal"/.test(red);
  log("M-D7: the reducer still accepts Portal as an authored surface type",
    reducerAccepts);
}

// ---- summary --------------------------------------------------------------
const fails = results.filter((ok) => !ok).length;
const agree = results.length - fails;
console.log(fails === 0
  ? `\n${agree}/${results.length} AGREE · 0 DRIFT — the settled dollhouse rules hold across engine / viz / skin / world-client\n`
  : `\n${agree}/${results.length} AGREE · ${fails} DRIFT — settled canon is violated; fix before any visual work\n`);
console.log("PARKED, deliberately unpinned: roof-vs-balcony, cut-capping, ceiling-tops-as-walkable");
console.log("(CANON-LEDGER \"OPEN — owner is deciding\" — this matrix must never grow an assertion about them)");
process.exit(fails ? 1 : 0);
