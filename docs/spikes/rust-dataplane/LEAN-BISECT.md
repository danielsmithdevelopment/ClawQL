# Lean-floor bisect — Oct 15 vs tip (2026-10-22)

Same single-op probe: `scripts/benchmarks/heap-vs-anon-plateau.mjs` with `BUN_RUNTIME=1 BUN_SMOL=1 N=2000`.

## Endpoints

| Build | Commit / tree | Anon plateau median | Notes |
| --- | --- | ---: | --- |
| **Oct 15 (published cite)** | `95015461b` (`cursor/cf-mt-slim-memory-board-a621`) | **131.4 MB** | Matches ~130 MB cite |
| Tip before lazy port | density branch + prune, eager payments/memory | **~313 MB** | Same probe |
| Tip lean-confirm (pre-port) | `spawn-bun-lean` + `lean-confirm-bun` | **294.6 MB** | Start ~198 MB |
| **Tip after lazy port (this branch)** | restore Oct-15 lazy listen | **141.7 MB** | Idle anon **~83 MB**, **0** onnx/sharp maps |

## Root cause (env / startup diff)

Lineages diverge at merge-base `66f003479`. The Oct-15 cite lived on the cf-mt side branch; tip never inherited that tree. Diff of equal-arm boot imports showed **configuration / lazy-load regression**, not missing product features:

| Eager on tip (before port) | Cost |
| --- | --- |
| Static `clawql-payments/plugin` in `clawql-api-adapters` | Tens of MB even with `CLAWQL_HTTP_SKIP_PAYMENTS=1` |
| Static `clawql-memory/vector/pgvector` (dispose path) → embedding → onnx/sharp maps | Native maps at listen |
| Static `compose-horizontal-plugin-layers-static` + vault-seed without `enableMemory` gate | Pulls memory graph when sync path evaluates |
| Static `clawql-memory/okf` from `process-worm-host` | Memory graph on every adapters import |

**Ported back to tip (this branch):** skip-payments plugins, lazy vault-seed / dispose / static composer, lazy WORM memory sink, HTTP route lazy-loads, bench env `CLAWQL_HTTP_SKIP_PAYMENTS` + `SKIP_GRAPHQL` + catalog SQLITE defaults.

**Verdict:** the ~180 MB gap was **configuration**. After the port, tip reproduces a main-line lean floor (~**142 MB**) close to the Oct-15 cite — essentially the originally published ~130 MB band, rebuildable from a release. Public pages should cite **this tip number** (equal-arm lean / board ~130 MB), not an unreproducible side-branch-only figure and not the pre-port ~313 MB as the product floor.

## Catalog note

With catalog on (product default), restored tip still plateaus ~142 MB under the single-op probe. Catalog A/B before the port showed ~63 MB when SQLite was off on the fat host; that delta is moot once onnx/payments are off the listen graph.

## Week-2 density baseline (reproducible)

**Settled framing:** same effective latency, about **8–9×** less memory, Bun TypeScript build stable near **~130 MB** on tip.

| Arm | Anon | vs Rust ~15 MB |
| --- | ---: | ---: |
| Tip Bun `--smol` lean (heap-vs-anon / lean-confirm N=2000) | **~139–142 MB** | **~9×** |
| Tip Bun CF known-op **publish 3×10k** (per-rep range) | **[124.4, 128.5]** med **124.5** | **~8.0×** (8.0–8.3×) |
| Tip Bun CF known-op (1×5k confirmation) | ~129 MB | ~8.4× |
| Prior board (post-prune, pre-lazy-port) | ~235 MB | ~15× — **superseded**; do not quote |

**Latency (precise, 3×10k):** Rust call p50 ~**0.54 ms** vs Bun ~**1.04 ms** (~0.5 ms absolute — not a “2× faster” product claim). Bun slightly better at p99; call p999 effectively tied ([4.53, 4.95] vs [4.73, 5.05]). Effectively equal vs any real API. Rust’s case is density.

Publish artifact: [`dataplane-week1-post-lazy-3x10k.json`](../../benchmarks/gateway-multi-comparison/dataplane-week1-post-lazy-3x10k.json). Confirmation: [`dataplane-week1-post-lazy-5k.json`](../../benchmarks/gateway-multi-comparison/dataplane-week1-post-lazy-5k.json).
