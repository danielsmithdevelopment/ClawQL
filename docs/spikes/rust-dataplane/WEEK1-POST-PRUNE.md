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

### Post-lazy board remasure (2026-10-22)

Same recipe (`CF_DP_REPS=1` `CF_DP_ITERS=5000`) after restoring lazy listen:

| Arm | call p50 / p99 / **p999** (ms) | Plateau anon |
| --- | --- | ---: |
| Bun tip + prune + lazy | 1.05 / 3.11 / **7.00** | **~128.9 MB** |
| Rust dataplane | 0.55 / 3.91 / **5.64** | **~15.3 MB** |

Lean-confirm on that Bun host: **~138.5 MB**. Density vs Rust ≈ **8.4×** (board) / **~9×** (lean). The old **~15×** figure was the eager-listen board — **do not quote**. Artifacts: `/opt/cursor/artifacts/dataplane-week1-post-lazy/` · [`artifacts/week1-post-lazy-5k.json`](./artifacts/week1-post-lazy-5k.json).

**Density, not speed:** latency stays in-band; the Rust case for ClawQL Cloud is tenant density / cost per isolate (~**8–9×** less anon at lean/board under the restored host). Lean bisect: [LEAN-BISECT.md](./LEAN-BISECT.md). HTTP 300–700 ms stalls: **not** fixed by prune — [HTTP-TAIL-POST-PRUNE.md](./HTTP-TAIL-POST-PRUNE.md).