# NESWUD CI evidence

Runnable CI evidence for `@hubzz/engine`, published from the private
`network-lab` tree. In the private tree the engine lives at
`network-lab/engine`; here it lives at the repo root, so every `../engine/`
import in these scripts was rewritten to `../`. No logic was changed.

Prerequisites: Node 20+ and `tsx` (`npm i -g tsx`, or `npx tsx`).

Run from the repo root:

```
npx tsx ci/<script>.mjs
```

## Scripts that run in this repo

Verified 2026-10-10 against this exact engine tree.

- `ci/bench-matrix.mjs`: PASS. Nine derived scenes, 44,056 blocks. Prints NT1
  wire bytes vs raw occupancy vs zlib, publish-gate wall time vs block count,
  and flood-fill component timing vs grid size. Rewrites
  `ci/bench-results.json` on each run; the staged `ci/bench-results.md` is the
  recorded table from the 2026-10-10 run (5 runs per measurement, median).
- `ci/box-vs-shape-matrix.mjs`: the comparison matrix itself passes
  (18 AGREE, 0 DRIFT). Its trailing reducer source pin then reads
  `spacetime/src/lib.rs` from the private Rust crate and aborts; that pin
  cannot run here.
- `ci/surface-fp.mjs`: PASS. Reads `{blocks, meta, interfaces}` JSON on
  stdin, prints the `neswud2:` surface fingerprint on stdout. This is the
  engine leg of the viz canon-parity guard.
- `ci/fixtures/`: `footprints.mjs` (derived footprint constructors used by
  the matrices) and `neswud-pair.json` (the canonical NT1 pair fixture).

## Scripts staged but not runnable in this repo

These are published as evidence of what the full CI does. Each needs part of
the private tree that is intentionally not in the public mirror. Nothing was
edited to force them to run.

- `ci/engine-checks.mjs`: the main gate. Its first 49 engine checks pass
  here with 0 failures; it then aborts spawning `cli/hubzz`, the private CLI
  binary. Its remaining legs need `apps/world-client`, `../src`, and
  `../viz`. Run it in the full `network-lab` tree for the complete gate.
- `ci/nt1-matrix.mjs`: aborts on the unguarded Rust leg (`spacetime/laws`
  crate, `cargo build --example dump_nt1`) before printing its table; the CLI
  leg also needs `cli/hubzz`. Full tree only.
- `ci/dollhouse-matrix.mjs`: needs the `three` package, the world-client
  renderer (`apps/world-client/src/spatial/DollhouseSurfaces`), and the viz
  Python sources. Full tree only.
- `ci/parity-map-check.mjs`: pins `docs/VIZ-PARITY-MAP.md`, `scripts/check.sh`,
  `viz/`, and `src/` against each other. Private layout only.

## Deliberately excluded

- `ci/oracle-crosscheck.mjs`: needs the private Python oracle and the Rust
  crate; excluded for the same reason as the legs above.
- `stdb-*.mjs`: SpacetimeDB integration matrices; need a live SpacetimeDB.
- `ops-alerts.mjs`, `cli-smoke.mjs`, `zone-payload-dryrun.mjs`: operational
  tooling, not engine evidence.
- `package-lock.json`.

## Docs

- `docs/FORMULAS.md`: the NT1 wire spec that the nt1-matrix leg 2 implements.
- `docs/CANON-LEDGER.md`: canon rulings the checks pin.
- `docs/RUNBOOK-NESWUD-PRODUCTION.md`: the production runbook.
- `docs/adr/`: nine architecture decision records plus the ADR index.
- `docs/NESWUD-PROVENANCE.md`: research provenance with the contradiction
  register. Machine-local citation paths are redacted (see the note at the top
  of the file); redacted citations are not verifiable from this repo.
