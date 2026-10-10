# NESWUD bench results

**Date:** 2026-10-10. **Machine:** Linux VM, node v24.20.0.
**Runner:** `npx tsx ci/bench-matrix.mjs` (5 runs per measurement, median reported).
**Engine:** `@hubzz/engine` 0.1.0 (same tree the correctness matrices run against).

All scenes are single 6-connected integer solids, derived from
`ci/fixtures/footprints.mjs` constructors or generated stress shapes.

## NT1 codec: wire bytes vs raw occupancy vs zlib

| scene | blocks | NT1 bytes | raw bytes (1B/cell bbox) | zlib bytes | NT1/raw | NT1/zlib |
|---|---|---|---|---|---|---|
| pair | 2 | 22 | 2 | 10 | 11.000 | 2.20 |
| L-8x6x6 | 234 | 63 | 288 | 19 | 0.219 | 3.32 |
| room-8x6 | 120 | 112 | 192 | 18 | 0.583 | 6.22 |
| floorplan-2room | 178 | 204 | 288 | 30 | 0.708 | 6.80 |
| tower-10 | 378 | 663 | 1,008 | 26 | 0.658 | 25.50 |
| solid-8 | 512 | 91 | 512 | 14 | 0.178 | 6.50 |
| solid-16 | 4,096 | 307 | 4,096 | 27 | 0.075 | 11.37 |
| solid-32 | 32,768 | 1,171 | 32,768 | 53 | 0.036 | 22.09 |
| shell-32 | 5,768 | 2,487 | 32,768 | 154 | 0.076 | 16.15 |
| **corpus total** | **44,056** | **5,120** | **71,922** | **351** | **0.071** | **14.59** |

Round-trip `decode(encode(blocks))` reproduces every input block set exactly
(9/9 scenes).

## Publish-gate latency (`validateUploadedSpace`, kind "public")

| scene | blocks | gate ms | verdict | errors |
|---|---|---|---|---|
| pair | 2 | 0.21 | invalid | 1 |
| L-8x6x6 | 234 | 10.81 | invalid | 1 |
| room-8x6 | 120 | 3.77 | valid | 0 |
| floorplan-2room | 178 | 16.54 | valid | 0 |
| tower-10 | 378 | 19.41 | invalid | 2 |
| solid-8 | 512 | 23.33 | valid | 0 |
| solid-16 | 4,096 | 457.19 | invalid | 1 |
| solid-32 | 32,768 | 27,606.93 | invalid | 1 |
| shell-32 | 5,768 | 1,204.71 | invalid | 1 |

Verdicts reflect rule outcomes on scenes built for shape stress, not for
passing validation (solids have no spawn/air, the pair is below minimums);
the gate runs its full pipeline and collects errors rather than bailing early,
so timings are representative of a full pass.

## Handshake graph build + flood-fill component labeling

| scene | blocks | graph build ms | findConnectedComponents ms | clusters |
|---|---|---|---|---|
| pair | 2 | 0.02 | 0.00 | 1 |
| L-8x6x6 | 234 | 0.67 | 0.24 | 1 |
| room-8x6 | 120 | 0.32 | 0.05 | 1 |
| floorplan-2room | 178 | 0.35 | 0.11 | 1 |
| tower-10 | 378 | 1.27 | 0.35 | 1 |
| solid-8 | 512 | 1.43 | 1.79 | 1 |
| solid-16 | 4,096 | 11.73 | 5.51 | 1 |
| solid-32 | 32,768 | 280.18 | 172.21 | 1 |
| shell-32 | 5,768 | 18.23 | 6.78 | 1 |

Graph build = `addBlock` + `autoLinkBlock` per block (the handshake pass);
flood fill = `findConnectedComponents` on the linked graph.

## Reading

NT1 compresses the naive 1-byte-per-cell occupancy grid by 14x across the
corpus (28:1 on the 32k solid), but it is not competing with zlib on bytes:
zlib is ~14.6x smaller than NT1 in aggregate because NT1 spends its 9-bit
tokens on per-cell neighbor state (4 horizontal bits, presence, 2-bit up/down
states), which is structural information zlib's entropy coding discards.
Anyone citing NT1 as a codec should cite the ratio against raw occupancy, not
against a general compressor. The publish gate is milliseconds at room scale
but degrades superlinearly: 23 ms at 512 blocks, 457 ms at 4k, ~27.6 s at
32k blocks. No scale claim about the gate is defensible until that curve is
profiled and flattened. Flood-fill component labeling itself is well behaved
(172 ms at 32k blocks); the gate's cost is elsewhere in the pipeline.
