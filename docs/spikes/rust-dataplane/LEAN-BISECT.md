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

## Tip-lineage checkpoint (same probe, `N=1000`)

| Tree | Anon plateau median |
| --- | ---: |
| `f06c1080b` — Merge #1323 www-benchmarks-cf-board (2026-10-16) | **292.5 MB** |
| Tip density branch (2026-10-22) | **~313 MB** |

**Finding:** tip/mainline was **already ~293 MB** when the CF board landed. Only ~**20 MB** has accumulated on tip since then. The 131→313 gap is mostly **lineage / host config**, not a post-board tip creep: the Oct-15 ~130 MB cite lives on `cursor/cf-mt-slim-memory-board-a621` (`95015461b`), which is **not** an ancestor of tip.

## Catalog A/B on tip (same probe, `N=1000`)

| `CLAWQL_CATALOG_SQLITE` | Anon plateau median |
| --- | ---: |
| `1` (product default) | **316.4 MB** |
| `0` | **253.3 MB** |

SQLite catalog explains ~**63 MB** of tip’s floor. Tip with catalog **off** is still ~**122 MB** above Oct 15 (253 vs 131). Remaining gap vs the cite is the cf-mt-side lean host vs tip product host — next step is a **diff of equal-arm env + boot imports** between `95015461b` and `f06c1080b`, not a tip-only first-parent walk after #1323.

## Week-2 baseline (accepted until env diff lands)

Use tip Bun after climb fix: board **~235 MB** / lean probe **~290–315 MB**. Do not claim ~130 MB as tip’s floor. Rust ~15 MB ⇒ ~**8–15×** density depending on which Bun number is cited.

Artifacts: `/opt/cursor/artifacts/lean-bisect/`.
