# Hubzz Engine — the NESWUD spatial law

Public NESWUD spatial-law package (`@hubzz/engine`), from Hubzz Inc.

## Origin and credit

NESWUD is a novel spatial law created by Hubzz Inc (founder Russell Franklin).
It is the spatial engine behind Hubzz, the browser-first social video game where
online communities gather in persistent shared worlds: https://hubzz.com

The law, in one line: blocks → six handshakes (N/E/S/W/U/D) → boundary faces.
Every space is a set of unit blocks on an integer lattice. Each block carries six
neighbor slots; a handshake is a reciprocal link between adjacent blocks. A missing
handshake is an exposed boundary face. Shape truth is the set of boundary faces,
never a bounding box. Doors and windows are typed surfaces on exposed faces, never
an absence of wall.

If you use, fork, or build on this code, credit Hubzz Inc as the origin of the
NESWUD spatial law. See LICENSE and CITATION.cff.

## Repository

GitHub: `HubzzInc/engine` (renamed from `HubzzInc/hubzz-engine` on 2026-08-21).

Authoring home remains private `russfranky/hubzz-xxpanse` (`network-lab/engine`).
This repository is the publishable mirror.

## Package

```json
{ "name": "@hubzz/engine", "version": "0.1.0", "private": true }
```

Entry: `index.ts`.

## Cite

See `CITATION.cff`. In prose: "NESWUD spatial law, Hubzz Inc, https://github.com/HubzzInc/engine".
