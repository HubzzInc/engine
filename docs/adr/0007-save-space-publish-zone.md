# ADR 0007 — Save a Space, Publish a Zone

**Status:** Accepted

## Context
"save", "upload", and "publish" had been used interchangeably for what happens to a Space's
detail. That blurred two distinct operations and mis-set expectations about what touches the
chain. The original `russfranky/spatial_mapping` zone_engine is explicit about its model:
*build · merge · publish "Zones" to a blockchain, securing state via cryptographic fingerprints
while keeping large datasets off-chain.* Network-lab must speak the same language so the docs,
skills, and (later) the code agree on what is local design vs. what is a chain artifact.

## Decision
Adopt the **zone-publication** model as the shared language:

- **Save** = a **Space**. Running the NESWUD gate and, if it passes, writing the validated
  `space_scene` design (voxels, openings, tiles, objects) via the `save_scene` reducer (deprecated
  alias: `upsert_scene`). A save
  is the local design commit and is **off-chain** — the design data the spine holds, not a chain
  artifact.
- **Publish** = a **Zone**. Committing a Zone to the chain: the canonical **fingerprint goes
  on-chain**, the **large dataset stays off-chain** (the `space_scene` design the save produced).
  You publish a *Zone*, not a *space*.

This matches the `spatial_mapping` zone_engine (fingerprints on-chain, large datasets off-chain)
and supersedes the earlier "publish a space / publish the `space_scene`" framing.

## Consequences
- The glossary (`CONTEXT.md`) and skills speak one language: a Space is **saved** (off-chain),
  a Zone is **published** (on-chain fingerprint, off-chain data); "upload" (the dead MySQL path)
  is retired.
- **Future stage — on-chain SPACE publish.** A space-level on-chain publish — a Space staged as
  a **furnished digital asset** with **nested assets**, its fingerprint **pinning the
  furniture** — is a later target, **not this codebase**. It is recorded here so the term is
  reserved and not conflated with today's Zone publish.
- RESOLVED (ZP-005, 2026-07-07): the reducer is `save_scene`; `upsert_scene` stays as a
  deprecated alias so deployed clients keep working. The `space_scene` TABLE keeps its name —
  it names the data (a Space's scene), which was always accurate; the verb was the confusion.
  (tracked as ZP-005); this ADR changes the language, not the live reducer semantics.
