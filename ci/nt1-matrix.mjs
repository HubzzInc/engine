// NT1 BITMASK MATRIX — the wire-format parity gate the oracle cross-check does
// not cover. `ci/oracle-crosscheck.mjs` proves M1-M8 (faces, openings, walls,
// walkability, validation, side-tape spine, handshake fingerprint). NT1 — the
// compact "train upward" exterior shape-detail codec — has no such matrix, so
// nothing has been pinning the ENGINE's bytes to the WRITTEN SPEC.
//
// The three legs, per fixture:
//   LEG 1  the engine        engine/space-shape.ts encodeNeswudBitmask /
//                            decodeNeswudBitmask (the law).
//   LEG 2  the written spec  viz/docs/FORMULAS.md "NT1 bitmask wire",
//                            transcribed literally below as an INDEPENDENT
//                            reader/decoder. This is a cross-check leg, exactly
//                            like the Python/Rust legs in oracle-crosscheck —
//                            it exists to disagree with leg 1 if the doc and the
//                            code have drifted. It is never imported by
//                            anything that renders or saves.
//   LEG 3  the CLI           cli/hubzz bitmask --blocks <f> --json (the seam viz
//                            actually consumes: `nt1 bytes` / `nt1 roundtrip`).
//
// Per fixture it asserts:
//   ROUND    decode(encode(blocks)) is the input block set EXACTLY (as a set,
//            and with no duplicates emitted).
//   LAYOUT   the byte layout parses per spec from an independent walk — magic
//            "NT1", minY i16 LE, runCount u16 LE, per-run u16 repeat + u16
//            componentCount, per-component i16 x/z + u32 tokenCount +
//            ceil(tokenCount*9/8) packed bytes — landing exactly on the end of
//            the buffer, with minY/runCount matching independently derived
//            values.
//   TOKENS   every 9-bit token, unpacked with the spec's own
//            `packed = tokenIndex*9 + bit` formula, carries PRESENT (2^4), uses
//            no reserved (3) vertical state, has reciprocal N/E/S/W connectors
//            across the WHOLE run (not just within a component), and carries
//            the U/D state the adjacent runs imply.
//   SPEC     the leg-2 decoder, driven only by the doc's rules, reproduces the
//            same block set as the engine decoder.
//   CLUSTER  computeSpaceShape(decoded).clusters.length === 1 (the doc's final
//            gate).
//   CLI      cli/hubzz bitmask --json agrees on the hex bytes, the block count
//            and roundTrip.
//
// Fixtures are DERIVED, never hand-typed: ci/make-l-scene.mjs (the L truth
// footprint), the engine's own synthesizeShellWalls for the shells, and the
// RLE scene generators ci/make-mez-scene.mjs / ci/make-air-spawn-scene.mjs /
// ci/make-test-scene.mjs decoded back through engine/scene-codec.
//
//   ./cli/node_modules/.bin/tsx ci/nt1-matrix.mjs
import { execFileSync } from "child_process";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  encodeNeswudBitmask, decodeNeswudBitmask, computeSpaceShape,
  synthesizeShellWalls, DIR_OFFSET, OPPOSITE,
} from "../space-shape";
import { decodeSceneBlocks } from "../scene-codec";
import { lFloorCells, L_OPENINGS } from "./make-l-scene.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "nt1-matrix-"));

// ---------------------------------------------------------------- leg 2: the written spec
// viz/docs/FORMULAS.md, "NT1 bitmask wire". Transcribed, not rederived:
//   header  bytes[0..2] = "NT1"; bytes[3..4] = minY i16 LE; bytes[5..6] = runCount u16 LE
//   run     u16 repeat; u16 componentCount
//   comp    i16 origin.x; i16 origin.z; u32 tokenCount; ceil(tokenCount*9/8) packed bytes
//   token   word = N*2^0 + E*2^1 + S*2^2 + W*2^3 + PRESENT*2^4 + Ustate*2^5 + Dstate*2^7
//   packing packed = tokenIndex*9 + bit; byte = floor(packed/8); mask = 1 << (packed mod 8)
const SPEC_MAGIC = "NT1";
const SPEC_PRESENT = 1 << 4;
const SPEC_HORIZONTAL = { N: 1 << 0, E: 1 << 1, S: 1 << 2, W: 1 << 3 };
const SPEC_DIRS = ["N", "E", "S", "W"];

const specUnpack = (bytes, offset, count) => {
  const words = [];
  for (let i = 0; i < count; i++) {
    let word = 0;
    for (let bit = 0; bit < 9; bit++) {
      const packed = i * 9 + bit;
      if (bytes[offset + Math.floor(packed / 8)] & (1 << (packed % 8))) word |= 1 << bit;
    }
    words.push(word);
  }
  return words;
};
const specUp = (word) => (word >> 5) & 0b11;
const specDown = (word) => (word >> 7) & 0b11;
const specConnects = (word, dir) => (word & SPEC_HORIZONTAL[dir]) !== 0;

/** Parse the whole wire per the doc. Throws on any layout violation. */
function specParse(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (magic !== SPEC_MAGIC) throw new Error(`spec: magic is ${JSON.stringify(magic)}, not "NT1"`);
  const minY = view.getInt16(3, true);
  const runCount = view.getUint16(5, true);
  let offset = 7;
  const runs = [];
  for (let r = 0; r < runCount; r++) {
    const repeat = view.getUint16(offset, true);
    const componentCount = view.getUint16(offset + 2, true);
    offset += 4;
    const components = [];
    for (let c = 0; c < componentCount; c++) {
      const origin = { x: view.getInt16(offset, true), z: view.getInt16(offset + 2, true) };
      const tokenCount = view.getUint32(offset + 4, true);
      offset += 8;
      const packedBytes = Math.ceil(tokenCount * 9 / 8);
      if (offset + packedBytes > bytes.length) throw new Error(`spec: run ${r} component ${c} tokens run past the buffer`);
      components.push({ origin, tokenCount, words: specUnpack(bytes, offset, tokenCount) });
      offset += packedBytes;
    }
    runs.push({ repeat, components });
  }
  if (offset !== bytes.length) throw new Error(`spec: layout ends at ${offset}, buffer is ${bytes.length}`);
  return { minY, runCount, runs };
}

/** BFS from each component origin exactly as the doc describes, validating
 *  presence, reserved states, reciprocity and U/D agreement; emits the blocks. */
function specDecode(parsed) {
  const { minY, runs } = parsed;
  const runCells = runs.map((run) => {
    const cellWords = new Map();
    for (const component of run.components) {
      const queue = [component.origin];
      const enqueued = new Set([`${component.origin.x}_${component.origin.z}`]);
      for (let i = 0; i < component.words.length; i++) {
        const cell = queue[i];
        if (!cell) throw new Error("spec: component has tokens no BFS walk reaches");
        const word = component.words[i];
        if ((word & SPEC_PRESENT) === 0) throw new Error(`spec: token ${i} lacks PRESENT (2^4)`);
        if (specUp(word) === 3 || specDown(word) === 3) throw new Error(`spec: token ${i} uses reserved vertical state 3`);
        const key = `${cell.x}_${cell.z}`;
        if (cellWords.has(key)) throw new Error(`spec: cell ${key} appears twice in one run`);
        cellWords.set(key, { word, x: cell.x, z: cell.z });
        for (const dir of SPEC_DIRS) {
          if (!specConnects(word, dir)) continue;
          const d = DIR_OFFSET[dir];
          const next = { x: cell.x + d.x, z: cell.z + d.z };
          const nextKey = `${next.x}_${next.z}`;
          if (!enqueued.has(nextKey)) { enqueued.add(nextKey); queue.push(next); }
        }
      }
      if (queue.length !== component.tokenCount) {
        throw new Error(`spec: component declares ${component.tokenCount} tokens, BFS reaches ${queue.length} cells`);
      }
    }
    // "every horizontal connector must be reciprocal" — across the whole run.
    for (const [key, { word, x, z }] of cellWords) {
      for (const dir of SPEC_DIRS) {
        const d = DIR_OFFSET[dir];
        const neighbor = cellWords.get(`${x + d.x}_${z + d.z}`);
        const connected = specConnects(word, dir);
        if (connected && !neighbor) throw new Error(`spec: dangling ${dir} connector at ${key}`);
        if (neighbor && (!connected || !specConnects(neighbor.word, OPPOSITE[dir]))) {
          throw new Error(`spec: non-reciprocal ${dir}/${OPPOSITE[dir]} at ${key}`);
        }
      }
    }
    return cellWords;
  });

  const blocks = [];
  let y = minY;
  for (let r = 0; r < runs.length; r++) {
    const below = r > 0 ? runCells[r - 1] : null;
    const above = r + 1 < runs.length ? runCells[r + 1] : null;
    for (const [key, { word, x, z }] of runCells[r]) {
      // "U/D states must match adjacent runs": 0=connected, 1=hollow, 2=object-boundary
      const expectUp = above ? (above.has(key) ? 0 : 1) : 2;
      const expectDown = below ? (below.has(key) ? 0 : 1) : 2;
      if (specUp(word) !== expectUp) throw new Error(`spec: U state ${specUp(word)} at run ${r} cell ${key}, adjacency implies ${expectUp}`);
      if (specDown(word) !== expectDown) throw new Error(`spec: D state ${specDown(word)} at run ${r} cell ${key}, adjacency implies ${expectDown}`);
      for (let dy = 0; dy < runs[r].repeat; dy++) blocks.push({ x, y: y + dy, z });
    }
    y += runs[r].repeat;
  }
  return blocks;
}

// ---------------------------------------------------------------- fixtures (derived, never typed)
const sceneBlocks = (script) => {
  const out = join(scratch, `${script}.json`);
  execFileSync(process.execPath, [join(root, "ci", `${script}.mjs`), out], { stdio: "pipe" });
  const scene = JSON.parse(JSON.parse(readFileSync(out, "utf8"))[1]);
  return decodeSceneBlocks(scene.voxels.voxels).map((b) => ({ x: b.x, y: b.y, z: b.z }));
};
const flat = (cells, y = 0) => cells.map((c) => ({ x: c.x, y, z: c.z }));
const stack = (cells, layers) => {
  const blocks = [];
  for (let y = 0; y < layers; y++) for (const c of cells) blocks.push({ x: c.x, y, z: c.z });
  return blocks;
};

const lCells = lFloorCells();
const lFloor = flat(lCells);
// the two diagonal extremes of the L footprint — derived, so raising them gives
// a layer with two disjoint horizontal islands over one connected Space.
const corner = (pick) => lCells.reduce((best, c) => (pick(c) > pick(best) ? c : best));
const islandCells = [corner((c) => -(c.x + c.z)), corner((c) => c.x + c.z)];

// M11 shape families. The item names the cases that must decode identically
// before the train carries outside / zone-to-zone loading: multi-component
// horizontal footprints, changing vertical footprints, cavities, overhangs,
// and mezzanines. Each is BUILT from a rule below, not typed out cell by cell.
const rect = (x0, z0, w, d, y) => {
  const out = [];
  for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) out.push({ x, y, z });
  return out;
};
/** A plate with its centre cell removed — the layer that encloses a void. */
const ring = (x0, z0, size, y) =>
  rect(x0, z0, size, size, y).filter((b) =>
    !(b.x === x0 + (size >> 1) && b.z === z0 + (size >> 1)));

// A sealed void: solid, ring, solid. The middle layer's footprint differs from
// both neighbours, so it is also a changing vertical footprint, and the hole is
// a cell whose U and D states must both read "present neighbour" while it is
// itself absent — the case a naive train gets wrong.
const cavity = [...rect(0, 0, 5, 5, 0), ...ring(0, 0, 5, 1), ...rect(0, 0, 5, 5, 2)];

// An overhang: a narrow pier with a wide slab on top, so the upper run's
// footprint is a strict SUPERSET of the one below it.
const overhang = [...rect(2, 2, 2, 2, 0), ...rect(0, 0, 6, 6, 1)];

// Two disjoint horizontal islands in the bottom run, rejoined by a bar above.
// The run has two components; the Space is still one cluster. This is the case
// the cross-component reciprocity check exists for.
const islandsRejoin = [
  ...rect(0, 0, 2, 2, 0), ...rect(5, 0, 2, 2, 0),
  ...rect(0, 0, 7, 2, 1),
];

// A footprint that changes on EVERY layer, so every layer is its own run and
// nothing collapses into a repeat.
const staircase = Array.from({ length: 6 }, (_, y) => rect(y, 0, 3, 3, y)).flat();

const FIXTURES = [
  { name: "single-cell", blocks: flat([lCells[0]]) },
  { name: "L-floor", blocks: lFloor },
  { name: "L-room-shell", blocks: lFloor.concat(synthesizeShellWalls(lFloor, 2)) },
  { name: "L-room-doors", blocks: lFloor.concat(synthesizeShellWalls(lFloor, 3, L_OPENINGS)) },
  { name: "L-prism-x40", blocks: stack(lCells, 40) },
  { name: "L-two-islands-above", blocks: lFloor.concat(flat(islandCells, 1)) },
  { name: "mez-scene", blocks: sceneBlocks("make-mez-scene") },
  { name: "air-spawn-scene", blocks: sceneBlocks("make-air-spawn-scene") },
  { name: "lobby-stairs-scene", blocks: sceneBlocks("make-test-scene") },
  // M11 families
  { name: "cavity-5x5x3", blocks: cavity },
  { name: "overhang-pier", blocks: overhang },
  { name: "islands-rejoin", blocks: islandsRejoin },
  { name: "staircase-6", blocks: staircase },
];

// ---------------------------------------------------------------- helpers
const key = (b) => `${b.x},${b.y},${b.z}`;
const setOf = (bs) => new Set(bs.map(key));
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));
const hex = (bytes) => Buffer.from(bytes).toString("hex");

/** Run count implied by the spec's own rule: consecutive layers sharing an
 *  exact footprint are one run. Derived from the input, not read from bytes. */
const expectedRuns = (blocks) => {
  const byY = new Map();
  for (const b of blocks) {
    const layer = byY.get(b.y) ?? new Set();
    layer.add(`${b.x},${b.z}`);
    byY.set(b.y, layer);
  }
  const ys = [...byY.keys()].sort((a, b) => a - b);
  let runs = 0, previous = null;
  for (const y of ys) {
    const footprint = [...byY.get(y)].sort().join("|");
    if (footprint !== previous) runs++;
    previous = footprint;
  }
  return { runs, minY: ys[0], layers: ys.length };
};

const cliBitmask = (name, blocks) => {
  const file = join(scratch, `${name}.blocks.json`);
  writeFileSync(file, JSON.stringify({ blocks }));
  const out = execFileSync(join(root, "cli", "hubzz"), ["bitmask", "--blocks", file, "--json"],
    { maxBuffer: 1 << 26 }).toString().trim();
  return JSON.parse(out.slice(out.lastIndexOf("\n") + 1));
};

// ---------------------------------------------------------------- leg 4: the Rust reducer law
// M11 promotes NT1 from a TS/CLI proof to the Rust/reducer + exterior loader
// seam. A train arriving from a client is decoded THERE, so the reducer's own
// decoder has to agree byte-for-byte — and reject byte-for-byte. Built and fed
// exactly like the Rust legs in oracle-crosscheck (M3/M4/M6).
const rustDecode = (entries) => {
  execFileSync("cargo", ["build", "--quiet", "--example", "dump_nt1",
    "--manifest-path", join(root, "spacetime/laws/Cargo.toml")],
    { env: { ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` }, stdio: "pipe" });
  const input = entries.map(([name, bytes]) => `${name}|${hex(bytes)}`).join("\n");
  const out = execFileSync(join(root, "spacetime/laws/target/debug/examples/dump_nt1"),
    { input, maxBuffer: 1 << 26 }).toString().trim();
  const decoded = new Map();
  for (const line of out.split("\n").filter(Boolean)) {
    const at = line.indexOf("|");
    const name = line.slice(0, at), body = line.slice(at + 1);
    if (body.startsWith("ERR:")) decoded.set(name, { error: body.slice(4) });
    else decoded.set(name, { blocks: new Set(body ? body.split(";") : []) });
  }
  return decoded;
};

// ---------------------------------------------------------------- run
console.log("\nNT1 BITMASK MATRIX — engine bytes vs the FORMULAS.md wire spec vs cli/hubzz vs the Rust reducer law\n");
const rows = [];
let drift = 0;
const fail = (fixture, check, detail) => { drift++; rows.push({ fixture, check, detail }); };

// One batched Rust call for every fixture that encodes at all; a fixture that
// throws in the encoder is reported by the loop below on its own.
const rustInputs = [];
for (const fixture of FIXTURES) {
  try { rustInputs.push([fixture.name, encodeNeswudBitmask(fixture.blocks)]); }
  catch { /* reported as THROW in the per-fixture loop */ }
}
const rustFixtures = rustDecode(rustInputs);

const table = [];
for (const fixture of FIXTURES) {
  const input = setOf(fixture.blocks);
  const marks = { ROUND: "-", LAYOUT: "-", TOKENS: "-", SPEC: "-", CLUSTER: "-", CLI: "-", RUST: "-" };
  let bytes = null, parsed = null, verdict = "AGREE";
  const mark = (check, ok, detail) => {
    marks[check] = ok ? "ok" : "DRIFT";
    if (!ok) { verdict = "DRIFT"; fail(fixture.name, check, detail); }
  };

  try {
    bytes = encodeNeswudBitmask(fixture.blocks);

    // ROUND — engine encode -> engine decode -> exact block set
    const decoded = decodeNeswudBitmask(bytes);
    const decodedSet = setOf(decoded);
    mark("ROUND", sameSet(input, decodedSet) && decoded.length === decodedSet.size,
      `in ${input.size} cells / out ${decoded.length} emitted, ${decodedSet.size} distinct`);

    // LAYOUT — independent header + structure walk against derived expectations
    parsed = specParse(bytes);
    const want = expectedRuns(fixture.blocks);
    const layers = parsed.runs.reduce((n, r) => n + r.repeat, 0);
    const cells = parsed.runs.reduce((n, r) =>
      n + r.repeat * r.components.reduce((m, c) => m + c.tokenCount, 0), 0);
    const layoutOk = parsed.minY === want.minY && parsed.runCount === want.runs &&
      parsed.runCount === parsed.runs.length && layers === want.layers && cells === input.size;
    mark("LAYOUT", layoutOk,
      `minY ${parsed.minY}/${want.minY} runCount ${parsed.runCount}/${want.runs} layers ${layers}/${want.layers} cells ${cells}/${input.size}`);

    // TOKENS + SPEC — the doc's decoder, driven only by the doc's rules
    const specBlocks = specDecode(parsed);
    marks.TOKENS = "ok"; // specDecode throws on presence/reserved/reciprocity/U-D violations
    mark("SPEC", sameSet(input, setOf(specBlocks)) && specBlocks.length === decoded.length,
      `spec leg emitted ${specBlocks.length}, engine leg ${decoded.length}`);

    // CLUSTER — the doc's final gate
    const clusters = computeSpaceShape(decoded).clusters.length;
    mark("CLUSTER", clusters === 1, `clusters=${clusters}`);

    // CLI — the third leg
    const cli = cliBitmask(fixture.name, fixture.blocks);
    mark("CLI", cli.bitmaskHex === hex(bytes) && cli.roundTrip === true &&
      cli.blocks === input.size && cli.headerBytes === 7,
      `cli ${cli.bytes}B roundTrip=${cli.roundTrip} blocks=${cli.blocks}`);

    // RUST — the reducer's own decoder, on the exact same bytes (M11)
    const rust = rustFixtures.get(fixture.name);
    mark("RUST", !!rust?.blocks && sameSet(input, rust.blocks),
      rust?.error ? `rust rejected: ${rust.error}`
        : `rust emitted ${rust?.blocks?.size ?? 0} of ${input.size}`);
  } catch (error) {
    verdict = "DRIFT";
    drift++;
    rows.push({ fixture: fixture.name, check: "THROW", detail: String(error && error.message || error) });
  }

  table.push({
    name: fixture.name,
    blocks: input.size,
    bytes: bytes ? bytes.length : 0,
    runs: parsed ? parsed.runCount : 0,
    comps: parsed ? parsed.runs.reduce((n, r) => n + r.components.length, 0) : 0,
    marks, verdict,
  });
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(`${pad("FIXTURE", 22)}${padL("CELLS", 7)}${padL("BYTES", 7)}${padL("RUNS", 6)}${padL("COMPS", 7)}  ${pad("ROUND", 7)}${pad("LAYOUT", 8)}${pad("TOKENS", 8)}${pad("SPEC", 7)}${pad("CLUSTER", 9)}${pad("CLI", 7)}${pad("RUST", 7)}VERDICT`);
for (const r of table) {
  console.log(`${pad(r.name, 22)}${padL(r.blocks, 7)}${padL(r.bytes, 7)}${padL(r.runs, 6)}${padL(r.comps, 7)}  ` +
    `${pad(r.marks.ROUND, 7)}${pad(r.marks.LAYOUT, 8)}${pad(r.marks.TOKENS, 8)}${pad(r.marks.SPEC, 7)}${pad(r.marks.CLUSTER, 9)}${pad(r.marks.CLI, 7)}${pad(r.marks.RUST, 7)}${r.verdict}`);
}

// ---------------------------------------------------------------- tamper guards
// The spec's validity rules are only worth anything if a corrupted wire is
// REJECTED. Each case mutates a valid encoding and asserts both legs throw.
console.log("\nTAMPER GUARDS — a corrupted wire must be rejected, not silently decoded\n");
const base = encodeNeswudBitmask(FIXTURES[2].blocks); // L-room-shell: multi-run, multi-layer
// First token of the first component, per the spec's own header sizes:
// 3 magic + 2 minY + 2 runCount, then 2 repeat + 2 componentCount, then
// 2 origin.x + 2 origin.z + 4 tokenCount. Token i bit b lives at
// byte TOKEN0 + floor((i*9+b)/8), mask 1 << ((i*9+b) % 8).
const TOKEN0 = 7 + 4 + 8;
const tokenByte = (i, bit) => TOKEN0 + Math.floor((i * 9 + bit) / 8);
const tokenMask = (i, bit) => 1 << ((i * 9 + bit) % 8);
const clearBit = (b, i, bit) => { b[tokenByte(i, bit)] &= ~tokenMask(i, bit); };
const setBit = (b, i, bit) => { b[tokenByte(i, bit)] |= tokenMask(i, bit); };
const tampers = [
  { name: "magic byte flipped", mutate: (b) => { b[0] ^= 0xff; } },
  { name: "runCount inflated", mutate: (b) => { new DataView(b.buffer).setUint16(5, 999, true); } },
  { name: "trailing byte appended", bytes: () => Uint8Array.from([...base, 0]) },
  { name: "byte truncated", bytes: () => base.slice(0, base.length - 1) },
  { name: "PRESENT (2^4) cleared on token 0", mutate: (b) => clearBit(b, 0, 4) },
  { name: "all horizontal connectors cleared on token 0", mutate: (b) => { for (let bit = 0; bit < 4; bit++) clearBit(b, 0, bit); } },
  { name: "Ustate set to reserved 3 on token 0", mutate: (b) => { setBit(b, 0, 5); setBit(b, 0, 6); } },
  { name: "Dstate set to reserved 3 on token 0", mutate: (b) => { setBit(b, 0, 7); setBit(b, 0, 8); } },
];
// M11: the reducer decodes trains that arrive from a CLIENT, so "the Rust leg
// rejects it too" is the half that actually protects the seam. A tamper case
// the reducer accepts is a hole no amount of TS validation closes.
const tamperBytes = tampers.map((t) => [t.name,
  t.bytes ? t.bytes() : (() => { const copy = base.slice(); t.mutate(copy); return copy; })()]);
const rustTampers = rustDecode(tamperBytes);

for (const [name, bytes] of tamperBytes) {
  const legs = [
    ["engine", () => decodeNeswudBitmask(bytes)],
    ["spec", () => specDecode(specParse(bytes))],
  ];
  const outcomes = legs.map(([leg, fn]) => {
    try { fn(); return { leg, rejected: false, why: "decoded without error" }; }
    catch (error) { return { leg, rejected: true, why: String(error.message || error) }; }
  });
  const rust = rustTampers.get(name);
  outcomes.push({ leg: "rust", rejected: !!rust?.error, why: rust?.error ?? "decoded without error" });
  const identical = hex(bytes) === hex(base);
  const ok = !identical && outcomes.every((o) => o.rejected);
  if (!ok) { drift++; rows.push({ fixture: `tamper:${name}`, check: "REJECT", detail: outcomes.map((o) => `${o.leg}: ${o.why}`).join(" · ") }); }
  console.log(`${ok ? "✓" : "✗"} ${pad(name, 34)} engine=${outcomes[0].rejected ? "reject" : "ACCEPT"}  spec=${outcomes[1].rejected ? "reject" : "ACCEPT"}  rust=${outcomes[2].rejected ? "reject" : "ACCEPT"}`);
}

// ---------------------------------------------------------------- summary
rmSync(scratch, { recursive: true, force: true });
const total = FIXTURES.length + tampers.length;
console.log("");
if (drift) {
  for (const r of rows) console.log(`  DRIFT  ${r.fixture} [${r.check}]  ${r.detail}`);
  console.log(`\nNT1: ${total - drift}/${total} AGREE  ·  ${drift} DRIFT\n`);
  process.exit(1);
}
console.log(`NT1: ${total}/${total} AGREE  ·  0 DRIFT`);
console.log("engine bytes == FORMULAS.md wire spec == cli/hubzz bitmask, round-trip exact, one cluster\n");
