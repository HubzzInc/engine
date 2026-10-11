# Incremental zone fingerprint: benchmark bundle

Reproduces the incremental-fingerprint results reported in the NESWUD paper
(Section 4.3). Everything here runs with only the Python standard library.

## What it is

`zone_engine/` is the zone-geometry oracle the benchmark tests: the `Zone`
class with the legacy flat `generate_fingerprint_hash()` (O(V) re-walk per
update, kept untouched as the reference) and the two-level incremental
construction (`region_fingerprint` + `refresh_region_fingerprint`,
O(V_r + #regions)). It is the minimal code needed to run the benchmark, not
the full engine.

`bench-fingerprint.py` first asserts correctness (determinism, sensitivity
to voxel add/remove, incremental update byte-identical to from-scratch
recomputation of the two-level construction, legacy reference intact), then
times the legacy flat rehash against the one-region incremental update with
interleaved A/B measurement (gc collected and disabled around each sample,
`time.perf_counter_ns`), 15 pairs per case, and prints JSON with medians
plus the raw per-trial data.

## Run it

From the repo root:

    python3 ci/fingerprint/bench-fingerprint.py > ci/fingerprint/bench-fingerprint-results.json

The script exits non-zero if any correctness check fails. To refresh the
committed results, redirect stdout as above on a quiet machine and commit
the JSON.

## Results

`bench-fingerprint-results.json` is the output of the run described above,
committed for the record. Each case reports the medians and the full
`raw_trials` arrays (legacy ms, incremental ms, per-pair speedup ratios),
so the summary statistics are independently checkable from the raw data.

## Notes

- Workloads are synthetic: random voxel scatters (seeded) at 6,500 voxels
  per region, 1/2/4 regions. Absolute timings vary with hardware; the
  structural result (speedup tracking region count, byte-identical
  incremental updates) does not depend on it.
- The benchmark compares the incremental construction against the legacy
  flat rehash of the same oracle, not against another engine.
