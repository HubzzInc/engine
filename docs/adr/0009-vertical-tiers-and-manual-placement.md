# ADR 0009 — Vertical tiers, manual placement, and the slice-removal exception

**Status:** **PROPOSED — NOT IMPLEMENTED (2026-07-26).**

Nothing in the "Decision" section below is built, and none of it is canon. The
only parts of this document that describe running code are in
[§1 Already enforced](#1-already-enforced-cite-do-not-restate) and
[§2 Corrections](#2-corrections-to-the-source-draft), both of which were checked
against the code on the date above and carry citations. Everything else is a
proposal awaiting the owner's ruling.

`CANON-LEDGER.md` is deliberately **untouched** by this ADR. The ledger records
the owner's rulings; this is derived design and belongs here until a ruling
lands.

---

## Context

A written specification of the "Canonical Tier System" proposed four things:
a rigid vertical tier set, a rule that manual edits (Builder UI and CLI) may not
exceed the vertical bounds of the current authored stack, a "slice-removal
exception" to that rule for moving a Space vertically, and a latent extension
from an 8-stack to a 12-stack limit.

Most of the tier system in that draft **already exists and is already enforced**
— restating it in a second document is the exact stale-doc failure this repo
keeps hitting, where a doc drifts from the code and the next session "fixes" the
code to match the doc. So this ADR does three jobs and no others:

1. point at what is already enforced, rather than repeat it;
2. record five claims in the draft that contradict the running code;
3. propose the smallest mechanism that delivers the intended UX.

---

## 1. Already enforced (cite, do not restate)

Verified in `spacetime/laws/src/lib.rs` on 2026-07-26:

```rust
MIN_SPACE_HEIGHT: 2 · MIN_FLOOR_AREA: 16 · MIN_WALL_WIDTH: 3
FLOOR_HEIGHT_RATIO: 8 · ALLOWED_HEIGHTS: [2, 4, 6, 8]
```

- `validate_space_geometry` judges the **authored local solids**, before the
  shell is synthesized, with `height = max_y - min_y + 1`.
- Order is load-bearing and short-circuits: `SPACE_TOO_SHORT` first, then
  `SPACE_TOO_SMALL`, then `HEIGHT_NOT_QUANTIZED`. A 3x5 floor reports only
  `min-floor`, which M5's Rust leg caught once already.
- It is **reducer-authoritative** (M15): a rejected save changes nothing —
  scene, fingerprint, links, walkable and standable rows are byte-identical
  after the attempt.
- Zone budgets come from `zone_budget()`: Central 50,000 · Mid 40,000 ·
  Outer 30,000. Separately, `MAX_SAVED_CELLS` is a flat 50,000
  (`CELLS_EXCEEDED`), owner-set under OPS1.
- The buildable core is `[4, 59]` — 56x56, edge reserve 4 (2 road + 2
  sidewalk) — not the full 64x64 grid.
- Occupancy divisor is **not uniform**: the validate-space skill documents the
  standard divisor as 4 and flex as 2.

**Anything that needs these numbers should cite this section or the code. A
second statement of a settled constant is how two constants drift.**

---

## 2. Corrections to the source draft

Each was checked against the code; each would fail review as written.

| # | Draft claim | What the code says |
|---|---|---|
| 1 | The Dollhouse View uses `dollhouseHiddenDirs` | **Superseded.** `dollhouseVisibleFaces` (per-face: camera dot test → seam survival → support) is current for the dollhouse and the skin, held byte-equal to the viz's Python by `ci/dollhouse-matrix.mjs` leg M-D6. `dollhouseHiddenDirs` is the older whole-direction filter, retained for the space-editor shell only (`SpaceShell.ts`). The repo's agent instructions explicitly ban regressing the skin back to direction hiding. |
| 2 | The fingerprint is "the definitive Source of Truth for the 2D-Net reconstruction" | **Inverted.** `neswud2:` is a sha256 over the handshake stream plus a typed surface overlay. A 2D-Net cannot be reconstructed from a hash. The scene rows are the truth; the fingerprint *detects disagreement* with them — that is what `FINGERPRINT_MISMATCH` alerts on. |
| 3 | Max occupancy is `⌊floor tiles / 4⌋` | Incomplete — flex spaces use divisor 2. As written it under-reports flex capacity. |
| 4 | A missing handshake renders a "green D-face floor (`#1ab21a`)" | The colour is real but it is the **zone-builder's** floor material (`ThreeScene.tsx`), not a handshake indicator. Binding a colour to "exposed D-face" collides with ruling 7 — dollhouse and zone-overview surfaces stay neutral `0x808080`, kind colours are city-map markers only — and the CC-02 palette pin exists because a wrong palette kept re-entering through descriptions like this. |
| 5 | Slice removal must preserve an "Integrity Column" required for Teleportal function | **No such constraint exists.** The spine is *computed, never persisted*: `spineFromRows` needs >= 2 Spaces in a Structure and anchors at the Structure's max corner. Nothing reads a continuous block column. Either the draft invents a constraint, or one is intended — but it cannot be published as a description of the system. |

---

## 3. Decision (proposed)

### 3.1 The bound is the TIER ENVELOPE, not the current block extent

The draft's rule — "manual edits may not exceed the vertical bounds of the
current authored stack" — is unusable taken literally. A Space with only a floor
at `y=0` has extent `[0,0]`, so the rule forbids placing a second block: you
could never build upward at all.

The bound is the **declared tier's envelope**:

```
buildable y ∈ [min_y, min_y + tier − 1]      tier ∈ ALLOWED_HEIGHTS
```

A tier-4 Space has room at `y = 0..3` whether or not anything is authored at
`y=3` yet. Inside the envelope, manual placement is completely free — no
per-block validation, no stepping, no ceremony.

This is also the right mental model for an author: **you are building inside a
room that has a ceiling.** A ceiling is not annoying. An *invisible* ceiling is.

### 3.2 The clamp is an AFFORDANCE, not a rule — which deletes the exception

The draft introduces a second *class* of rule. Today exactly one thing decides
legality: `validate_space_geometry`, at save, in the reducer. A rule about
*edits* cannot live there — the reducer never sees intermediate edits — so it
could only live in the client, where it has no authority and will drift from the
gate.

Split it instead:

| layer | statement | authority |
|---|---|---|
| **save time** | `height = max_y − min_y + 1 ∈ ALLOWED_HEIGHTS` | reducer — **already exists** |
| **edit time** | clamp the placement cursor to `[min_y, min_y + tier − 1]`; Push/Pull steps the whole stack tier→tier | client — no authority needed |

**Slice removal then needs no exception at all.** It is an ordinary edit that
changes `min_y`/`max_y` and re-anchors; the save-time law re-validates the
result exactly as it would any other edit. Removing the top slice lets the base
shift upward, removing the bottom slice descends — and neither is a special
case, because neither was ever forbidden by a rule with authority.

Net: **one law, one affordance, zero exceptions.** The draft's version is one
law, one unenforceable rule, and one exception to it — where the exception is
the part that would need its own error codes, its own tests, and its own drift
surface.

### 3.3 Overlap with a Space above is a different rule, already held

The draft's stated motivation — a new Space created on top of an existing one
producing "phantom geometry" — is not a vertical-bounds question. It is the
same-zone overlap guard, which already holds in `viz/docs/FORMULAS.md`, the
engine, the publish gate and the reducer, and is gated by
`ci/box-vs-shape-matrix.mjs`. Point at that rather than re-deriving it.

---

## 4. Builder UX (proposed)

The clamp is only pleasant if the ceiling is visible *before* the first blocked
click. A click that silently does nothing is worse than an error.

1. **The ghost block clamps to the ceiling** rather than disappearing. Above the
   envelope, the preview sticks at `y = tier − 1`, so the cursor still tracks.
2. **Render the ceiling in build mode.** `SpaceShell` already draws the shell;
   showing its top face at low opacity while placing costs nothing.
3. **Tier always on screen** — `Tier 4 · y 0–3`. One line, no menu.
4. **Surface Push/Pull at the point of friction.** The moment the cursor pushes
   against the ceiling is exactly when the next tier is wanted, so the
   affordance belongs there — a ghost row at `y = tier` reading
   `Raise to tier 6`, click-through to promote. Toolbar-only means every author
   learns the ceiling by being blocked by it.
5. **Push/Pull and slice removal are SINGLE undo entries.** A tier change
   rewrites the shell and can move `min_y`; if that lands in the undo stack as N
   block operations, one undo leaves a half-promoted Space. This is the item
   most likely to be got wrong and the one authors will complain about loudest.

Existing footholds — this is smaller than it looks. `Editor.ts` already carries
`spaceBox.layers`, and `ValidationGate.ts` already knows that "tiers count the
full stack, so walls occupy `y 1..box.layers`". The envelope is an existing
value that is not yet drawn, nor enforced at the cursor.

### 4.1 The stair case — an open product call

The fixture convention is floor at `y=0` plus a 3-step stair reaching `y=3`,
i.e. a height-4 Space. An author drawing that stair inside a tier-2 Space hits
the ceiling on step 3 — and "blocked" is not obviously right, because height 4
is a legal tier and the save would have accepted it.

- **Block and offer** — the stroke stops, the promote affordance appears under
  the cursor. One extra click; nothing changes without consent.
- **Auto-promote** — placing into `y = tier` bumps the tier and continues the
  stroke. Fluid, but it changes the shell mid-gesture, and the shell is a
  room-wide consequence.

Recommendation: **block and offer**, for the same reason the reducer owns the
publish rules — a room-wide consequence should not be a side effect of drawing a
stair. If testing shows authors stall there, auto-promote with a prominent undo
is defensible. This is a question for user testing, not for the code.

---

## 5. The 12-stack extension path

`ALLOWED_HEIGHTS` is a literal in **three legs** — the Rust laws crate, the TS
engine, and the Python oracle — held equal by the M1–M8 cross-check. Adding a
tier is one line per leg, and M5 fails loudly on any leg that is missed. That is
the cheap case, and it is already the case.

**Do not make the tier set runtime-configurable.** The oracle cross-check
compares *behaviour*; a shared config lets all three legs agree while all three
are wrong. Keep the literal in each leg and let the cross-check do its job.

Two things to settle before the extension, neither of which the draft answers:

- **Which set?** `HEIGHT_NOT_QUANTIZED` names a membership list, not a formula,
  so `{2,4,6,8,12}` and `{2,4,6,8,10,12}` are both coherent.
- **The cell cap binds first.** 12 stacks over the 56x56 core reaches
  `MAX_SAVED_CELLS` (50,000, flat) before it reaches the per-tier zone budget —
  a 52x52x20 solid already trips `CELLS_EXCEEDED`. Whatever the tier becomes,
  the cell cap is what a dense Space actually hits.

---

## Consequences if adopted

- One vertical law, at the save boundary, unchanged from today — the reducer
  keeps deciding, and the builder cannot make an illegal Space publishable.
- The builder may be as permissive as it likes without becoming a correctness
  risk, because every affordance above is re-decided at save.
- The "slice-removal exception" disappears from the spec entirely, along with
  the error codes and tests it would have required.
- No engine, reducer, or gate change is implied. This is client work plus the
  documentation corrections in §2.

## Open questions for the owner

1. §4.1 — block-and-offer, or auto-promote?
2. §5 — which tier set at 12?
3. §2.5 — is the "Integrity Column" a constraint to be *added*, or was it a
   description error? The spine currently needs no block column.
4. Should the §2 corrections be applied to the source draft before it is
   published anywhere, given three of them contradict standing rulings?

## Verification

Every claim in §1 and §2 was read from the code on 2026-07-26 —
`spacetime/laws/src/lib.rs`, `spacetime/src/lib.rs`, `engine/space-shape.ts`,
`apps/space-editor/src/{Editor.ts,scene/SpaceShell.ts,managers/ValidationGate.ts}`,
`src/components/zone/ThreeScene.tsx`, and `docs/adr/0002`. Nothing in §3–§5 has
been implemented or measured; those sections are proposals.
