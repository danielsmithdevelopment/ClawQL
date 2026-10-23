# Week-1 remasure — post `_streamMapping` prune (2026-10-22)

**Label: `fast-path-only`.** Same harness as [WEEK1.md](./WEEK1.md); Bun tip includes host orphan prune (#1390 / Phase B branch).

## Setup

- `CF_DP_REPS=1` `CF_DP_ITERS=5000` (signal remasure; full 3×10k still optional)
- `CF_DP_LEAN_N=2000` `CF_DP_LEAN_MAX_MB=350`
- Artifact: `/opt/cursor/artifacts/dataplane-week1-post-prune/week1-summary.json`

## Lean confirm (single DNS known-op × 2000)

| Metric | Value |
| --- | ---: |
| Plateau median anon | **243.5 MB** (pre lazy-listen restore) |
| Tip lean after lazy port | ~**142 MB** ([LEAN-BISECT](./LEAN-BISECT.md)) |

## Board (1 × 5000 sessions, 0 errors both arms)

| Arm | per-call p50 / p99 / **p999** (ms) | session p99 / **p999** (ms) | Memory plateau |
| --- | --- | --- | --- |
| Bun tip + prune | 0.97 / 3.30 / **4.86** | 20.3 / **31.3** | **~234.9 MB plateau** |
| Rust dataplane | 0.48 / 3.62 / **4.89** | 18.7 / **23.0** | **~15.3 MB flat** |

## vs pre-prune WEEK1 (3×10k)

| | Pre-prune Bun | Post-prune Bun (1×5k) | Rust |
| --- | --- | --- | --- |
| Memory | **climbs ~200→~3444 MB** | **plateaus ~235 MB** | ~15–16 MB flat |
| call p999 | 9.75 ms | **4.86 ms** | ~5.6 → **4.89 ms** |

Climb fix confirmed under CF known-op load. Memory gap vs tip Bun was ≈ **15×** (235 / 15.3) on the **pre-lazy-port** host. Per-call p999 is near-parity; Rust still wins session p999. Go/no-go still waits Phase B governance on both sides.

### Post-lazy confirmation (2026-10-22) — not a publish board

One run (`CF_DP_REPS=1` `CF_DP_ITERS=5000`) after restoring lazy listen. Confirms the ~130 MB Bun plateau is tip-reproducible. **Publish cites need the usual 3×10k with ranges** (see SPIKE runbook); do not treat single-run p999 as a headline.

| Arm | call p50 / p99 / p999 (ms) | Plateau anon |
| --- | --- | ---: |
| Bun tip + prune + lazy | 1.05 / 3.11 / 7.00 | **~128.9 MB** |
| Rust dataplane | 0.55 / 3.91 / 5.64 | **~15.3 MB** |

**Latency (precise):** Rust median per call is about half of Bun’s (0.55 vs 1.05 ms — **~0.5 ms absolute**). Bun is slightly better at p99; Rust slightly better at p999. All of that is well under a real upstream API call, so **latency is effectively equal**. Do **not** summarize the median as “Rust is 2× faster.”

Lean-confirm on that Bun host: **~138.5 MB**. Density vs Rust ≈ **8–9×** (board ~8.4× / lean ~9×). The old **~15×** figure was the eager-listen board — **do not quote**. Artifacts: `/opt/cursor/artifacts/dataplane-week1-post-lazy/` · [`dataplane-week1-post-lazy-5k.json`](../../benchmarks/gateway-multi-comparison/dataplane-week1-post-lazy-5k.json).

### Publish board — post-lazy 3×10k (2026-10-22)

`CF_DP_REPS=3` `CF_DP_ITERS=10000`, per-rep ranges (0 errors both arms). Artifact: [`dataplane-week1-post-lazy-3x10k.json`](../../benchmarks/gateway-multi-comparison/dataplane-week1-post-lazy-3x10k.json).

| Arm | call p50 range / med | call p99 | call p999 | Plateau anon MB |
| --- | ---: | ---: | ---: | ---: |
| Bun tip + prune + lazy | [1.03, 1.04] / **1.04** | [2.73, 2.77] | [4.53, 4.95] / **4.74** | **[124.4, 128.5]** / **124.5** |
| Rust dataplane | [0.54, 0.55] / **0.54** | [3.61, 3.76] | [4.73, 5.05] / **4.85** | **[15.5, 15.7]** / **15.6** |

Density vs Rust ≈ **8.0×** (med) — range about **8.0–8.3×**. Call p999 is effectively tied; median gap remains ~0.5 ms absolute (not “2× faster”).

**Week-2 framing (settled):** same effective latency, about **8–9×** less memory, TypeScript Bun build stable near **~130 MB** on the main line. Next: governance pipeline on Rust, then a fair comparison with both sides doing the full work. Lean bisect: [LEAN-BISECT.md](./LEAN-BISECT.md). HTTP 300–700 ms stalls: **not** fixed by prune — [HTTP-TAIL-POST-PRUNE.md](./HTTP-TAIL-POST-PRUNE.md).
