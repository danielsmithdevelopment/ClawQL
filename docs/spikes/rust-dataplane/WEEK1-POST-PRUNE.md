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

Climb fix confirmed under CF known-op load. Memory gap vs tip Bun ≈ **15×** (235 / 15.3). Per-call p999 is now near-parity; Rust still wins session p999. Go/no-go still waits Phase B governance on both sides.

**Density, not speed:** with the leak fixed, Bun call p999 **4.86 ms** vs Rust **4.89 ms** — latency is a dead heat. The Rust case for ClawQL Cloud is tenant density / cost per isolate. Against tip Bun after lazy-listen restore: ~**9–10×** at lean (~142 MB) and ~**15×** at the post-prune board plateau (~235 MB) until the board is remasured under the restored host. Lean: [LEAN-BISECT.md](./LEAN-BISECT.md). HTTP 300–700 ms stalls: **not** fixed by prune — [HTTP-TAIL-POST-PRUNE.md](./HTTP-TAIL-POST-PRUNE.md).
