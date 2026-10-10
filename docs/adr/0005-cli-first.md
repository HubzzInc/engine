# ADR 0005 — CLI-first: nothing outside headless reach

**Status:** Accepted

## Context
Edge-case coverage needs simulation and parameter sweeps that a GUI can't drive. Validation, shape, publishing, and movement all had to be exercisable without a browser in the loop.

## Decision
Everything the GUI does is drivable from `cli/hubzz`, with **modular rule parameters** injected into the one `engine/` ValidationEngine (so the CLI and the editor's publish gate run identical law). Commands: `params`, `kinds`, `validate`, `fingerprint`, `simulate`, `publish --dry-run`. Rule knobs: min height, height tiers, min floor, corridor width, occupancy density. `--stdb` targets a test module. The `ci/*.mjs` matrices cover the engine and the STDB reducers.

## Consequences
- Simulation sweeps and edge-case matrices are first-class and scriptable (exit codes, `--json`).
- The first sweeps immediately caught real bugs (stack-height convention drift; the floor-area/height coupling).
- New rules and shapes are proven by a `simulate`/`ci` case, not asserted.
