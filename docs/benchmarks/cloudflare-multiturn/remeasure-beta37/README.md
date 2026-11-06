# Executor remasure — 2.0.0-β.37 (provisional)

**Status:** measured on this agent host · **invite pending** · do **not** flip live `/benchmarks` cells yet.

| Field   | Value                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| Binary  | `executor@beta` → **2.0.0-beta.37**                                                     |
| Host    | Cursor cloud agent · 4 vCPU · ~15 Gi guest                                              |
| Harness | `scripts/benchmarks/http-concurrency-heap-ab.mjs` `ARMS=executor_v2` `CURVE=1` `REPS=3` |
| Invite  | [`../outreach-rhys-executor-draft.md`](../outreach-rhys-executor-draft.md)              |

## HTTP concurrency (priority remasure)

Artifact: [`http-concurrency-executor-β37-r3.json`](./http-concurrency-executor-β37-r3.json) · rollup [`SUMMARY.json`](./SUMMARY.json)

| Threshold (p99) | Prior publish (β.15) | β.37 REPS=3 median (range) |
| --------------- | -------------------: | -------------------------: |
| 100 ms          |                **2** |                **1** (1–2) |
| 250 ms          |               **10** |               **9** (9–10) |
| 500 ms          |               **22** |             **23** (21–23) |
| Peak RPS        |               **73** |          **~71** (67.7–73) |

Anon memory (from harness log, process tree): ~**1.5–3.2 GB** across the curve — still GB-class; not a β.15-only artifact. Zone-audit single-session ~2.1 GB cell is a different board (not remasured here).

### Reading

β.37 does **not** reverse the β.15 concurrency story. At the 100 ms SLO the tip is as soft or softer (median 1 vs published 2). Peak RPS is essentially unchanged. Keep published β.15 cells labeled until Rhys reviews config; then either promote β.37 medians or remasure again with his knobs.

Smoke (REPS=1, 2 s windows) had looked slightly friendlier (sustained 3 @100 ms) — REPS=3 with 3 s windows is the provisional board.

## Next

1. Send maintainer invite.
2. Remeasure zone-audit tokens / session latency / anon plateau on tip.
3. Pets multiturn + interleaved + chaos + governance (after `ci-executor-peer.sh` ported to v2).
