#!/usr/bin/env python3
"""
Incremental zone fingerprint: correctness checks + benchmark.

Compares the legacy flat generate_fingerprint_hash() (O(V) re-walk per
update) against the two-level incremental construction in
zone_engine/core/models.py
(region_fingerprint + refresh_region_fingerprint, O(V_r + #regions)).

Correctness (asserted, fails loudly):
  1. determinism: same voxels -> same fingerprint across constructions
  2. sensitivity: any voxel add/remove -> different fingerprint
  3. incremental == from-scratch: refresh_region_fingerprint(r) after an
     edit yields byte-identical output to incremental_zone_fingerprint()
  4. the legacy flat hash still works (untouched reference)

Benchmark: interleaved A/B timing of legacy flat rehash vs one-region
incremental update. Reports medians AND the raw per-trial data
(legacy_ms, incremental_ms, ratios for every pair), so the summary
statistics are independently checkable. JSON to stdout; redirect to
bench-fingerprint-results.json to refresh the committed results.

Usage: python3 ci/fingerprint/bench-fingerprint.py
Run from the repo root (or: cd ci/fingerprint && python3 bench-fingerprint.py).
Requires only the Python standard library.
"""
import sys
import os
import types
import importlib.util
import time
import json
import random
import gc
import statistics


BUNDLE = os.path.dirname(os.path.abspath(__file__))


def _load(modname, path):
    spec = importlib.util.spec_from_file_location(modname, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[modname] = mod
    spec.loader.exec_module(mod)
    return mod


# Stub the package hierarchy so importing core.models does not execute a
# heavy top-level zone_engine/__init__ (runtime/editor/chain imports in the
# authoring repo). Here the bundle ships its own minimal __init__ files,
# but the stub keeps the script robust either way.
_ze = types.ModuleType("zone_engine")
_ze.__path__ = [os.path.join(BUNDLE, "zone_engine")]
sys.modules["zone_engine"] = _ze
_core = types.ModuleType("zone_engine.core")
_core.__path__ = [os.path.join(BUNDLE, "zone_engine", "core")]
sys.modules["zone_engine.core"] = _core
_load("zone_engine.core.config",
      os.path.join(BUNDLE, "zone_engine", "core", "config.py"))
_load("zone_engine.core.geometry_utils",
      os.path.join(BUNDLE, "zone_engine", "core", "geometry_utils.py"))
_models = _load("zone_engine.core.models",
                os.path.join(BUNDLE, "zone_engine", "core", "models.py"))
Zone = _models.Zone


CONFIG = {
    "DISTRICTS": {"CENTRAL": {"allocation": 10 ** 9}},
    "ZONE_WIDTH": 64,
    "ZONE_DEPTH": 64,
    "INSET_SIZE": 4,
}


def make_zone(regions, per_region, seed):
    rng = random.Random(seed)
    z = Zone(0, 0, "CENTRAL", CONFIG)
    for i in range(1, regions):
        z.included_regions.add((i, 0))
    for (rx, ry) in z.included_regions:
        for _ in range(per_region):
            z.voxels[(rx, ry,
                       rng.randrange(4, 60), rng.randrange(4, 60),
                       rng.randrange(0, 6))] = 1
    return z


def check_correctness():
    # 1. determinism
    a = make_zone(2, 1500, 11).incremental_zone_fingerprint()
    b = make_zone(2, 1500, 11).incremental_zone_fingerprint()
    assert a == b, "fingerprint not deterministic"
    # 2. sensitivity
    z = make_zone(2, 1500, 11)
    before = z.incremental_zone_fingerprint()
    k = next(iter(z.voxels))
    del z.voxels[k]
    assert z.incremental_zone_fingerprint() != before, \
        "fingerprint insensitive to voxel removal"
    # 3. incremental == from-scratch after edit
    z = make_zone(4, 1500, 12)
    for reg in z.included_regions:
        z.refresh_region_fingerprint(*reg)
    k = next(k for k in z.voxels if k[0] == 0 and k[1] == 0)
    del z.voxels[k]
    inc = z.refresh_region_fingerprint(0, 0)
    scratch = z.incremental_zone_fingerprint()
    assert inc == scratch, "incremental update != from-scratch recomputation"
    # 4. legacy reference still works
    assert len(z.generate_fingerprint_hash()) == 64
    return True


def bench_case(regions, per_region, seed, pairs=15):
    z = make_zone(regions, per_region, seed)
    for reg in z.included_regions:
        z.refresh_region_fingerprint(*reg)
    k = next(k for k in z.voxels if k[0] == 0 and k[1] == 0)
    del z.voxels[k]
    assert z.refresh_region_fingerprint(0, 0) == z.incremental_zone_fingerprint()

    def sample(fn):
        gc.collect()
        gc.disable()
        t = time.perf_counter_ns()
        fn()
        d = (time.perf_counter_ns() - t) / 1e6
        gc.enable()
        return d

    ratios, legacy_ms, incr_ms = [], [], []
    for _ in range(pairs):
        o = sample(z.generate_fingerprint_hash)
        i = sample(lambda: z.refresh_region_fingerprint(0, 0))
        legacy_ms.append(round(o, 2))
        incr_ms.append(round(i, 2))
        ratios.append(round(o / i, 2))
    return {
        "regions": regions,
        "voxels": len(z.voxels),
        "pairs": pairs,
        "seed": seed,
        "voxels_per_region": per_region,
        "legacy_flat_ms_median": round(statistics.median(legacy_ms), 1),
        "incremental_ms_median": round(statistics.median(incr_ms), 1),
        "speedup_median": round(statistics.median(ratios), 1),
        "speedup_min": round(min(ratios), 1),
        "speedup_max": round(max(ratios), 1),
        "raw_trials": {
            "legacy_flat_ms": legacy_ms,
            "incremental_ms": incr_ms,
            "speedup_ratio": ratios,
        },
    }


def main():
    check_correctness()
    results = [bench_case(r, 6500, 7) for r in (1, 2, 4)]
    print(json.dumps({
        "correctness": "pass",
        "method": ("interleaved A/B timing of legacy flat rehash vs one-region "
                   "incremental update after a single-voxel edit; gc collected "
                   "and disabled around each sample; time.perf_counter_ns"),
        "benchmarks": results,
    }, indent=2))


if __name__ == "__main__":
    main()
