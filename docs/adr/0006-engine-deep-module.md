# ADR 0006 — NESWUD as a top-level engine deep module

**Status:** Accepted

## Context
The NESWUD engine lived at `server/src/neswud/` but was consumed by the server gate, the space-editor, the world-client, and the CLI — via a `@neswud` alias and an ugly `../../server/src/neswud` cross-package reach. It is the one shape seam; it shouldn't be owned by one app.

## Decision
Extract the engine to a top-level **`engine/`** deep module (small interface — `@neswud/...` — over a lot of behaviour). Group the app packages under **`apps/`** (server, world-client, space-editor, zone-builder, asset-manager). Top level is now `apps/ engine/ cli/ spacetime/ ci/ docs/ assets/`.

## Consequences
- One shared engine, consumed identically by every app + the CLI via the `@neswud` alias; no cross-package reach into a sibling app's `src`.
- Build configs' alias depth was updated and re-verified: 37/37 engine checks, space-editor loads, world-client builds, CLI green.
- New shape behaviour is added to `engine/` and flows to every consumer through the one seam (never forked into a consumer).

## Outstanding debt
Reducers are unauthenticated (anyone can write the spine); rotate the in-repo-history tokens; deploy the space-editor + set `VITE_SPACE_EDITOR_URL` so the city-map "Enter" works off-machine; wire the `ci`/probe harness into CI.
