# Executor remasure — 2.0.0-β.37 (provisional)

**Status:** measured on this agent host · **invite pending** · do **not** flip live `/benchmarks` cells yet.

**Launch channel:** see [`LAUNCH-CHANNEL.md`](./LAUNCH-CHANNEL.md). npm `latest` is still 1.6.11; tip install channel is `executor@beta` = **2.0.0-beta.37**. Treat these numbers as **tip-channel / harness-under-review**, not “stable 2.0.0 product truth.”

| Field | Value |
| --- | --- |
| Binary | `executor@beta` → **2.0.0-beta.37** |
| Host | Cursor cloud agent · 4 vCPU · ~15 Gi guest |
| Harness | `scripts/benchmarks/http-concurrency-heap-ab.mjs` `ARMS=executor_v2` `CURVE=1` `REPS=3` |
| Invite | [`../outreach-rhys-executor-draft.md`](../outreach-rhys-executor-draft.md) |

## HTTP concurrency (priority remasure)

Artifact: [`http-concurrency-executor-β37-r3.json`](./http-concurrency-executor-β37-r3.json) · rollup [`SUMMARY.json`](./SUMMARY.json)

| Threshold (p99) | Prior publish (β.15) | β.37 REPS=3 median (range) |
| --- | ---: | ---: |
| 100 ms | **2** | **1** (1–2) |
| 250 ms | **10** | **9** (9–10) |
| 500 ms | **22** | **23** (21–23) |
| Peak RPS | **73** | **~71** (67.7–73) |

Anon memory (from harness log, process tree): ~**1.5–3.2 GB** across the curve — still GB-class; not a β.15-only artifact. Zone-audit single-session ~2.1 GB cell is a different board (not remasured here).

### Reading (harness-first)

Treat this board as **suspect until config review**. Single-client warm `execute` on `/mcp` is ~60 ms and idle excl-motel RSS is already ~2 GB — so we are probably measuring **service residency + multiplex behavior under our flags**, not “one call is gigabyte-expensive.” Ask Rhys for the recommended concurrent-HTTP setup before promoting any cell.

Relative to the old β.15 publish: tip does not look better at 100 ms (median 1 vs 2). That is **not** a claim to put on the marketing page; it is a reason to fix the harness with maintainer input.

Smoke (REPS=1, 2 s windows) had looked slightly friendlier (sustained 3 @100 ms) — REPS=3 with 3 s windows is the provisional draft board only.

## Next

1. Send maintainer invite (after draft approval).
2. Remeasure zone-audit tokens / session latency / anon plateau on tip (or stable tag if named).
3. Pets multiturn + interleaved + chaos + governance (after `ci-executor-peer.sh` ported to v2).
