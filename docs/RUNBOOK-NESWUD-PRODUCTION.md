# RUNBOOK — NESWUD production readiness

**Status:** executable plan; the synthesis foundation is complete, product
integration and release hardening are not.

**Baseline:** commit `3605a7b` on `codex/neswud-synthesis` (2026-07-20).

## 1. Purpose

This runbook takes the current NESWUD foundation to a production release without
changing the spatial law:

> Blocks record which of their six neighbors exist (NESWUD handshakes); a Space
> is the flood-fill over touching blocks; a wall is a missing handshake; every
> other representation is a projection of that graph.

It is both an implementation order and a release checklist. A phase is complete
only when its named automated evidence exists. Passing unit tests alone does not
authorize a production publish.

Read these before changing spatial behavior, in order:

1. `AGENTS.md`
2. `docs/CANON-LEDGER.md` (rulings 1–15)
3. `docs/SPEC-ZONE-ARCHITECTURE.md` Part A
4. `docs/research/NESWUD-PROVENANCE.md`

## 2. Definition of production grade

The system is production grade when all of the following are true:

- **One law:** saved cells plus the sparse typed-surface overlay are the only semantic shape truth;
  boxes, train, Dollhouse, walls, collision, placement surfaces, and metrics are
  projections.
- **Server authority:** `save_scene` runs the complete validation gate inside the
  reducer. A modified or obsolete client cannot persist an invalid Space.
- **Complete product paths:** the default Public remainder, exterior train,
  air-entry resolver, exact face rendering, and typed vertical faces are wired to their
  real consumers—not only callable in tests or the CLI.
- **Backward compatibility:** every existing `space_scene` has the current
  fingerprint and standable-height projections, or a deterministic migration
  derives them before traffic reaches the new module.
- **Operational safety:** production data is backed up, restore is rehearsed,
  schema compatibility is known, and rollback does not depend on reconstructing
  state from memory.
- **Measured limits:** malformed-input, expansion, maximum-scene, save latency,
  subscription size, memory, and exterior-load budgets have enforced thresholds.
- **Live evidence:** local module matrices, browser transition tests, a staging
  migration rehearsal, and post-publish Maincloud smoke checks all pass.

Any unchecked condition means **release candidate**, not production grade.

## 3. Completed foundation

| Capability | Completed evidence | Production implication |
|---|---|---|
| One graph law | The parity harness exercises the Python oracle, TypeScript engine, Rust laws/reducer, and CLI on their applicable M1–M6/M8 legs | Shape, openings, walls, walkability, validation verdicts, spine, and base fingerprints have an anti-drift gate |
| Exact Space identity | `neswud2:` combines the existing oracle-parity handshake hash with a validated typed-surface stream | Door, Window, and different DoorLink targets cannot share a saved identity |
| Input hardening | Typed surfaces reject malformed directions/types/spans/targets; NT1 rejects expansion bombs and signed-16 overflow | Known codec/fingerprint denial-of-service and ambiguity cases are bounded |
| NT1 proof | TypeScript/CLI compact train round-trip covers repetition, multiple horizontal components, and vertical continuation | The exterior codec is viable, but is not yet the reducer or loader wire |
| Authored-interface authority | Scene codec, editor, reducer derivation, and Dollhouse use typed `interfaces` | Openings no longer need to be re-inferred from grouped wall voxels |
| Exact Dollhouse source | The box fallback was removed; saved cells drive the cutaway | Odd footprints are preserved inside a Space |
| Height-aware landing primitive | TypeScript and Rust share standable masks/drop ordering; reducer writes `space_standable` | Explicit Space/Structure URLs can fall to the first standable floor below |
| Default remainder primitive | `buildDefaultPublicSpace` returns one tagged Public allocation container | The owner’s Public/private/flex remainder rule is executable but not yet invoked by Zone publish |
| One-component authored Space guard | Saved authored Space scenes reject disconnected solid components | A Space remains the six-neighbor flood-fill it claims to be |
| Canon and provenance | `CANON-LEDGER`, architecture spec, QA inventory, and `NESWUD-PROVENANCE` reconcile the research generations | Historical box-fill, partition-gap, authored-wall, and obsolete direction models are fenced out |

Current verification on the owner’s Mac (through C0):

```text
engine checks             119/119
M1 boundary faces          14/14
M2 openings                 7/7
M3 walls                   21/21
M4 walkability             25/25
M5 validation              24/24
M6 side-tape stacks          5/5
M8 fingerprints            17/17
cross-language drift            0
repository gate       ALL GATES PASS
```

## 4. Ordered path to production

The order is deliberate. Correctness and authority precede compression and
presentation.

### Phase 0 — canonical cleanup (`C0`)

**Problem:** superseded prototypes can look authoritative even after the graph
law replaces them, inviting a future implementation to revive physical inset
gaps, authored navigation shafts, or a second traversal algorithm.

**Implementation:**

1. Delete physical face-gap geometry and inset block placement. Typed surfaces
   attach only to missing-handshake faces.
2. Delete authored navigation-column managers and creators. Keep only the pure,
   computed structure side-tape projection.
3. Route height-aware movement through the one generic A* implementation.
4. Delete unreferenced spatial utilities and correct active canonical prose.
5. Preserve deployed compatibility seams: `upsert_scene`, legacy opening lift,
   pre-`space_standable` fallback, and the isolated MySQL monolith.

**Exit:** boundary-interface and forbidden-API tracers pass; the full anti-drift
gate remains green. No compatibility wire is removed by this phase.

### Phase 1 — exact NESWUD face rendering (`M13`, then `M14`)

**Problem:** the engine already emits exact typed faces from missing handshakes,
but the Dollhouse rendered Wall faces from that list while routing Door/Window
presentation through an older grouped-opening projection that inferred type.
The production renderer therefore did not consume one exact typed-face stream
end to end. `U`/`D` typed faces are fingerprinted but do not yet have a complete
production presentation/interaction consumer.

**Implementation:**

1. Keep the compact saved cells/bitstring as geometry truth. Flood-fill emits a
   transient face address `{x,y,z,dir}` for each missing handshake; `y` is the
   vertical coordinate, so there is no extra `layer` field.
2. Render each face independently. The sparse typed-surface overlay selects
   Wall, Door, or Window for that address; it never becomes a second geometry
   model or persisted face array.
3. Preserve base block collision and the frozen `space_walkable` projection.
   Surface materials add no collision volume; Door travel remains `use_door`.
4. Pin the existing horizontal Dollhouse consumer in M13, then consume `U`/`D`
   through the same transient renderer path in M14.

**Required red-before-green fixtures:**

- outside corner: Door on one face, perpendicular face remains Wall;
- independent Door, Window, and Wall faces on one block;
- typed ceiling/floor face round-trip and presentation behavior (M14);
- saved fingerprint/type parity remains green while rendering stays transient.

**Exit:** no typed surface changes an unrelated face, no second face-storage
model exists, M13/M14 pass, and the full gate is green.

### Phase 2 — reducer-authoritative save (`M15`)

**Problem:** the client runs the complete gate, but `save_scene` currently runs
only reducer-side structural checks and derivations. A hostile or stale client
must not be able to persist a scene the editor would reject.

**Implementation:**

1. Express the complete publish/save rules in the Rust laws crate, consuming the
   existing decoded cells and typed interfaces.
2. Cross-check Rust verdict and error codes against TypeScript and the registered
   Python-oracle exceptions.
3. Run this validator inside `save_scene` before any table mutation.
4. Keep validation and all derived-table writes atomic.
5. Preserve the current `save_scene` wire; do not make clients coordinate a new
   multi-call protocol.

**Required cases:** every M5 case, malformed JSON, oversized payload, disconnected
authored scene, bad DoorLink target, private/public/flex rules, failed-save leaves
all prior rows and fingerprints unchanged.

**Exit:** direct HTTP and SDK calls cannot bypass the full gate; reducer verdict
parity is blocking in CI.

### Phase 3 — one default Public remainder in Zone publish (`M10`)

**Problem:** `buildDefaultPublicSpace` exists but Zone publish does not invoke it.

**Implementation:**

1. At Zone publish, subtract every authored allocation cell from the Zone’s
   allocation domain.
2. Assign all remaining allocation to exactly one computed Public container,
   tagged `exterior` for streaming/view role.
3. Keep public/private/flex as the only permission kinds. `exterior` is not a
   fourth kind.
4. Treat this computed Zone remainder as the documented exception to the
   authored-Space one-component guard. Do not split it by flood-fill component
   and do not impose an authored room-height ceiling.
5. Regenerate/invalidate it atomically when authored allocations change.

**Required cases:** empty Zone, one authored island, several authored Spaces,
disconnected leftover regions, full allocation/no remainder, tall item crossing
authored room height, owner item placement in the Public remainder.

**Exit:** a published Zone has zero unassigned cells and no more than one computed
default Public remainder.

### Phase 4 — URL Space discovery and standable migration (`M12`)

**Problem:** explicit `?space=`/`?structure=` coordinates preserve air height,
but a raw Zone coordinate does not yet resolve the containing/first discoverable
Space. Scenes saved before `space_standable` need a migration.

**Implementation:**

1. Resolve the incoming world coordinate against the lightweight Space box index.
2. For candidates, use exact saved allocation—not the box—to determine membership.
3. Choose deterministically when several candidates exist; record and test the
   tie-break law.
4. Pass the original requested height into `ready`.
5. Backfill `space_standable` for every existing saved scene by reusing the
   reducer’s current derivation. Make the operation idempotent and resumable.
6. Remove the lowest-floor compatibility fallback only after the backfill audit
   proves no saved scene lacks the row.
7. Add `ci/stdb-air-spawn-matrix.mjs` to blocking CI.

**Required cases:** high above multiple floors, below an upper floor, no floor at
requested column, exact boundary, overlapping boxes with one exact shape match,
no matching Space, legacy scene before/after backfill.

**Exit:** every supported URL form reaches the same deterministic landing; zero
published scenes lack current standable data.

### Phase 5 — NT1 exterior train integration (`M11`)

**Problem:** NT1 is a bounded TypeScript/CLI proof, not yet the Rust/reducer or
outside/zone-to-zone loading path.

**Implementation:**

1. Mirror NT1 encode/decode in the Rust laws crate.
2. Add byte-for-byte TypeScript/Rust/CLI parity fixtures.
3. Persist or transport the train as a versioned derived projection with the
   source `neswud2` fingerprint. Never replace `space_scene` as semantic truth.
4. Recompute when the source fingerprint changes; reject stale trains.
5. Make outside and zone-to-zone loading consume boxes first and NT1 only when
   shape detail is requested. Characters and furnished interiors remain absent
   from this view.
6. Enforce decoded-cell, component, coordinate, byte-size, and time budgets on
   every consumer.

**Required shapes:** pair, L, U, courtyard, disconnected horizontal components,
uniform tower, changing footprint, cavity, overhang, mezzanine, maximum budget,
malicious repetitions.

**Exit:** all three implementations decode identical cells; exterior loading
uses the train and demonstrates a measured improvement without semantic drift.

### Phase 6 — block-resolved Zone and Dollhouse presentation (`S3`)

**Repository:** the production Zone Builder is the skin at the repository
root (`../src`, same repo since the consolidation). This phase runs there
after M11.

**Implementation:**

1. Decode selected `space_scene` cells for Zone Builder detail/selection.
2. Restore outlined individual cells and the historical kind palette:
   Flex `#7ED36E`, Public `#6FA8E2`, Private `#E2B85E`.
3. Keep the current UI composition and selected-Space panel.
4. Enter Dollhouse as an in-place isometric cutaway of the exact selected Space:
   floor plus missing-face walls, no ceiling, dynamically hide camera-facing
   walls, Return to Zone View restores the prior camera.
5. Keep current neutral Dollhouse wall material unless the owner explicitly
   changes that ruling. Grid lines are presentation only; do not restore physical
   partition gaps.

**Exit:** screenshot/regression fixtures cover rectangle, L, courtyard, stacked
Space, selection outline, palette, Dollhouse enter/return, and no box-fill.

### Phase 7 — release engineering and operational limits (`OPS1`)

Before Maincloud promotion:

1. Add a checked-in, read-only production snapshot tool that exports every table,
   schema/module identity, row counts, and hashes into a timestamped directory.
   It must never print identity tokens.
2. Add a restore tool and rehearse it against a disposable local database from a
   real snapshot format.
3. Establish budgets for maximum saved cells/interfaces/JSON bytes, reducer save
   latency, derived-row size, NT1 expansion time, subscription row count, and
   browser draw calls/memory.
4. Add structured rejection/latency counters for `save_scene`, URL resolution,
   train decode, `ready`, Door, and side-tape travel.
5. Alert on migration incompleteness, fingerprint mismatch, derived-row absence,
   repeated malformed saves, and abnormal reducer latency.
6. Verify ownership/RLS for Public, Flex, and Private scenes with owner and
   non-owner identities.

**Exit:** backup and restore are both rehearsed; budgets fail closed in tests;
staging exposes enough telemetry to diagnose a bad release without user reports.

## 5. Verification ladder

Run each layer in order. A later green result does not excuse an earlier failure.

### 5.1 Pure and cross-language gate

```bash
bash scripts/check.sh
```

Required final line: `ALL GATES PASS`. On the owner’s Mac this also runs the
private Python oracle checkout; CI explicitly reports when that leg is absent.

### 5.2 Disposable local SpacetimeDB

The helper starts/publishes a local module and exports `STDB_URI`, `B`, `T`, and
`O` in the current shell:

```bash
# First prove both the CLI and the separate local standalone runtime exist.
# This accepts either the installer-provided `spacetime` command or Cargo's
# `spacetimedb-cli` binary and prints the runtime log on failure.
bash scripts/qa-stdb-env.sh doctor
source scripts/qa-stdb-env.sh up hubzz-prod-candidate 3027
```

Run the existing live matrices:

```bash
./ci/node_modules/.bin/tsx ci/stdb-move-matrix.mjs "$STDB_URI" hubzz-prod-candidate
./ci/node_modules/.bin/tsx ci/stdb-interest-matrix.mjs "$STDB_URI" hubzz-prod-candidate
./ci/node_modules/.bin/tsx ci/stdb-door-matrix.mjs "$STDB_URI" hubzz-prod-candidate "$O"
./ci/node_modules/.bin/tsx ci/stdb-spine-matrix.mjs "$STDB_URI" hubzz-prod-candidate "$O"
```

Publish the air fixture and run its matrix:

```bash
node ci/make-air-spawn-scene.mjs /tmp/air-spawn.json
curl -sf -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  "$B/call/save_scene" -d @/tmp/air-spawn.json
./ci/node_modules/.bin/tsx ci/stdb-air-spawn-matrix.mjs "$STDB_URI" hubzz-prod-candidate
```

Stop only the disposable instance when finished:

```bash
source scripts/qa-stdb-env.sh down 3027
```

Do not stop the separately managed developer instance at `127.0.0.1:3027` if it
was not started by this run. Choose another port when it is already occupied.

### 5.3 Browser and application proof

CI must be green for:

- world-client transition probe (Door and side-tape without reload);
- city → Zone → View → Enter/Walk deployment proof;
- editor save/reload of exact cells and interfaces;
- Zone/Dollhouse screenshots from S3;
- raw URL high-air landing from M12.

### 5.4 Migration rehearsal

Against a disposable database restored from the production snapshot format:

1. Record pre-migration table counts and hashes.
2. Publish the candidate module.
3. Run the standable/fingerprint/train/default-remainder backfills.
4. Run every matrix and browser proof.
5. Verify unchanged source scenes and expected new derived rows.
6. Run the same migration again; it must be a no-op.
7. Restore the pre-migration snapshot into another disposable database and
   compare it with the original snapshot.

## 6. Production promotion

Production publishing is an operator action because it can disconnect clients
and migrate live tables.

### Go/no-go record

Record these in the release entry before publishing:

- candidate commit and module build hash;
- all M10–M15/S3/OPS1 items complete;
- `scripts/check.sh` output;
- local matrix and browser proof links;
- staging snapshot, migration, idempotency, and restore evidence;
- production pre-publish snapshot location and hashes;
- schema compatibility result and expected disconnect behavior;
- named operator, rollback operator, and observation window.

### Publish

Only after the go/no-go record is complete:

```bash
cd spacetime
spacetime build
spacetime publish -s maincloud hubzz-spatial
```

Do not automatically run `seed_spaces` against an existing production database.
Seeds are for a new/empty environment unless a reviewed migration explicitly
requires otherwise.

### Immediate smoke checks

Verify before declaring success:

- pre/post row counts and source-scene hashes;
- expected derived rows exist for every saved scene;
- Public/Flex visibility and Private owner-only RLS;
- direct invalid `save_scene` is rejected without mutation;
- valid save/reload and `neswud2` fingerprint;
- high-air raw URL landing;
- Door and side-tape travel, including a Private owner denial/allow case;
- exterior box/train view and exact selected-Space Dollhouse;
- client reconnect after publish.

Observe error rate and reducer latency through the agreed window. A successful
publish command is not a successful release by itself.

## 7. Rollback

Rollback is triggered by data loss/corruption, migration incompleteness,
authorization/RLS regression, invalid-scene acceptance, traversal failure,
fingerprint drift, crash loop, or sustained latency above the production budget.

1. Stop further authoring saves or disable the affected entry point using the
   preplanned feature switch; do not improvise destructive table edits.
2. Capture the failing module identity, logs, counts, and hashes.
3. If only client presentation is faulty, roll back the clients while leaving
   compatible data/module state intact.
4. If module logic is faulty and the schema is backward-compatible, republish
   the last known-good module.
5. If data/schema changed incompatibly, restore into a new verified database
   from the pre-publish snapshot, run the smoke matrix there, then perform the
   reviewed cutover procedure.
6. Reconcile any saves accepted after the snapshot before reopening authoring.

Never claim rollback readiness until step 5 has been rehearsed. Never use a
broad destructive Git or filesystem command as an operational rollback.

## 8. Completion ledger

| Work item | State | Production gate |
|---|---|---|
| M9 synthesis foundation | Complete | commit `3605a7b`; all repository/oracle gates green |
| M13 exact horizontal face rendering | Complete | Phase 1 |
| M14 vertical typed-face consumer | Pending | Phase 1 |
| M15 reducer-authoritative full validation | Pending | Phase 2 |
| M10 default Public remainder publish wiring | Pending | Phase 3 |
| M12 raw URL discovery + projection migration | Pending | Phase 4 |
| M11 Rust/reducer/exterior NT1 integration | Pending | Phase 5 |
| S3 exact Zone/Dollhouse presentation | Blocked here: separate repo | Phase 6 |
| OPS1 backup/restore, budgets, telemetry | Pending | Phase 7 |

Update this table, `.ralph/items.json`, and `.ralph/progress.md` together. A
production item changes to Complete only after its exit evidence is committed.
