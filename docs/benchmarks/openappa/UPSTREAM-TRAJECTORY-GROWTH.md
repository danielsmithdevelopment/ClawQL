# Upstream: OpenAPPA per-call latency grows with session length

Filed upstream: [archestra-ai/OpenAPPA#711](https://github.com/archestra-ai/OpenAPPA/issues/711).

Measured against OpenAPPA **0.37.0** (opencode adapter, PROTOCOL=1 `POST /hook`).

## Summary

With a **single `root_id`**, `tool_call` latency grows roughly linearly with the number of prior calls in that trajectory. Short-session amortized benchmarks (rotating roots) hide this. Long agent sessions will hit host timeout budgets and fail closed on legitimate work.

## Reproduction

```bash
# ClawQL battery + keep-alive client (same shape as production: one root, paired tool_call+tool_result)
appa runtime --adapter opencode --listen 127.0.0.1:8791 \
  --config packages/clawql-api/openappa/appa.toml \
  --db /tmp/clawql-appa-curve.db

CLAWQL_OPENAPPA_URL=http://127.0.0.1:8791 \
  CLAWQL_OPENAPPA_CURVE_TIMEOUT_MS=5000 \
  node scripts/benchmarks/openappa/measure-session-length-curve.mjs
```

Artifact: [`results-session-length-curve.json`](./results-session-length-curve.json).

## Measured curve (loopback, keep-alive, n=5000)

| Call index | tool_call p50 | call+result p50 |
| ---: | ---: | ---: |
| 10 | 1.8 ms | 4.5 ms |
| 100 | 5.3 ms | 11.6 ms |
| 1,000 | 36 ms | 83 ms |
| 5,000 | 179 ms | 415 ms |

Growth ratio (5k / 10) ≈ **98×**. Hosts using a ~250 ms per-hook budget approach fail-closed around a few thousand calls.

Note: OpenAPPA 0.35 `#671` (cache trajectory labels / share projection) is present in 0.37.0; growth remains on the HTTP sidecar path.

## Proposed fix

Make each decision **O(1) in session length**:

1. **Incremental policy state** — update compact current state (labels, denials, approvals, attention) on each event; decide from that state, not a full history replay.
2. **Periodic snapshots** — recovery replays only from the last snapshot.
3. **Acceptance test** — re-run the one-root curve; **done when call 5,000 costs about what call 10 does**.

Rotating `root_id` mid-session is **not** an acceptable host workaround: it drops denials, approvals, and label narrowing (weaker policy).

## ClawQL host posture (context only)

Until fixed upstream, ClawQL documents support for ≤ 2,000 OpenAPPA-gated calls per MCP session and surfaces `ALERT: policy latency exceeded budget at call N` with `class: policy_latency_budget` on timeout. Opt-in remains off by default.
