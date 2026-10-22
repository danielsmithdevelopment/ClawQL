# Phase 0 — frozen go bars (ADR 0016)

Frozen **2026-10-22** for the spike. Change only with an explicit ADR amendment.

| Metric                           | Baseline (Bun lean listen)   | **Frozen go bar**                                                        |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Anon RSS under lean execute load | ~125–130 MB                  | **≤ 65 MB** (half Bun)                                                   |
| Latency                          | Bun equal-arm REST           | Clearly better **p999** on the same board                                |
| Clients / instance               | Bun median 84 @ p99 ≤ 100 ms | Meet or beat Bun on same HTTP multiplex workflow                         |
| Differential                     | —                            | **Zero** mismatches on agreed suite (Phase B+)                           |
| Verus                            | —                            | At least **policy evaluator** proved (Phase C); labels + digests stretch |

**Secondary note (not the go bar):** peer Go/Rust gateways ~99–103 MB. Half-Bun is stricter; if half-Bun is unrealistic after Phase A but peer-band is hit with better p999, record that in the Phase D write-up before changing the bar.

**Phase A exit (early stop):** if bare path (no governance) does not show a clear memory or p999 signal vs Bun **on the same SQLite catalog + same CF known-op workload at plateau**, stop before Phase B.

**Do not cite idle/toy RSS** (self-mock, tiny catalog, warm-but-idle) against the Bun lean-listen bar. Week-1 interleaved CF known-op runs are labeled **`fast-path-only`** until governance is in both arms.
