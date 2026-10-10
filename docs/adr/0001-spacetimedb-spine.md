# ADR 0001 — SpacetimeDB as the spine

**Status:** Accepted

## Context
The spatial system needed one source of truth for Spaces — readable by the city map, the editor, and the live world — plus live presence/movement. The prior path (SQLite/MySQL behind a server API) was down and didn't model live subscriptions.

## Decision
Adopt a single hosted **SpacetimeDB** database (`hubzz-spatial`, Maincloud) as **the spine**. `space` rows index Space boxes; `space_scene` rows hold a Space's **saved** detail (the off-chain design commit); `player_position`/`presence_session` drive live runtime. A Space's dedicated instance is a subscription `WHERE world = 'space:<id>'`.

## Consequences
- The macro map, the editor, and the world-client read one truth keyed by `space_id`.
- HTTP SQL is anonymously readable — convenient, but reducers are currently **unauthenticated** (see ADR 0006-debt; owner identity is outstanding).
- Module source is `spacetime/src/lib.rs`; schema changes are published by a human (`spacetime publish hubzz-spatial`).
