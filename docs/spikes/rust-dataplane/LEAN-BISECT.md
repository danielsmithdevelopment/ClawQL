# Lean-floor bisect — Oct 15 vs tip (2026-10-22)

Same single-op probe: `scripts/benchmarks/heap-vs-anon-plateau.mjs` with `BUN_RUNTIME=1 BUN_SMOL=1 N=2000`.

## Endpoints (reproduced this session)

| Build | Commit / tree | Anon plateau median | Notes |
| --- | --- | ---: | --- |
| **Oct 15 (published cite)** | `95015461b` (`cursor/cf-mt-slim-memory-board-a621`) | **131.4 MB** | Matches ~130 MB cite |
| **Tip (density branch)** | `cursor/density-baseline-a621` + prune | **313.1 MB** | Same probe + same CF fixtures copied onto tip |
| Tip lean-confirm (dataplane spawn, `LOAD=db`) | tip `spawn-bun-lean` + `lean-confirm-bun` | **294.6 MB** | Start ~198 MB; tip band gate ≤350 MB |
| Tip CF known-op board plateau | week-1 post-prune 1×5k | **~235 MB** | Different workload; still ≫130 |

Lineages **diverge** at merge-base `66f003479` (2026-10-10). The Oct-15 cite lives on the cf-mt side branch; tip never inherited that tree as an ancestor. Bisect therefore compares **endpoint probes**, then walks tip first-parent history for the step that crosses ~160 MB under this probe.

## Gap

~**180 MB** on the equal-arm Bun `--smol` single known-op probe (131 → 313). Heap samples on tip Bun were null (`/healthz` bench heap); anon from `smaps_rollup` is the scored metric.

## Catalog A/B on tip (same probe, `N=1000`)

| `CLAWQL_CATALOG_SQLITE` | Anon plateau median |
| --- | ---: |
| `1` (product default) | **316.4 MB** |
| `0` | **253.3 MB** |

SQLite catalog explains ~**63 MB** of tip’s floor. Tip with catalog **off** is still ~**122 MB** above Oct 15 (253 vs 131). Remaining gap is not “just” the catalog feature flag.

## Next

Binary-search tip first-parent commits after the cf-board merge (`f06c1080b`, #1323) with the same `heap-vs-anon` probe (`N=500` for speed), catalog on and off. Name the culprit commit (or accept a new floor) before week-2 Rust density claims use “~130 MB Bun”.

Artifacts: `/opt/cursor/artifacts/lean-bisect/`.
