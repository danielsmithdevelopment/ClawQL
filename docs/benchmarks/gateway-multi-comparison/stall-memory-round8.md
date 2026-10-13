# Stall + Ready memory — round 8

Follow-up to [`stall-memory-round7.md`](./stall-memory-round7.md).

## Finding (carry-forward)

Round 7's main result was not a ClawQL-only bug: **the load client and the catalog mock shared the multiturn parent process**. When that event loop was busy it delayed (1) request send, (2) mock serve, and (3) response read — for **every** arm that uses the equal-arm mock. Medians stayed plausible; **p999 absorbed harness coupling**.

Native fetch at n=10k did not beat node-fetch control. Kept opt-in (`CLAWQL_NATIVE_FETCH`). Same lesson as the early interleaving correction: small-run wins need the full board.

## Harness fix

| Change | Detail |
| --- | --- |
| Separate mock process | `scripts/benchmarks/lib/equal-arm-catalog-http-mock.mjs` — ready JSON on stdout, `/__bench/stats`, optional latency inject |
| Core pinning | `MT_PIN_CORES=1` → `taskset -c` for mock / gateway / client (`MT_MOCK_CPUS` / `MT_GATEWAY_CPUS` / `MT_CLIENT_CPUS`) |
| Board fields | `core_layout` (next to runtime flags) + `p999_status` |
| Realistic upstream (hook) | `MT_UPSTREAM_LATENCY_MS=20-100` (or fixed ms) — run **after** isolation board republishes tails |

### Knobs

| Env | Role |
| --- | --- |
| `MT_PIN_CORES=1` | Enable default layout mock=`0`, gateway=`1`, client=`2` (needs ≥3 CPUs) |
| `MT_MOCK_CPUS` / `MT_GATEWAY_CPUS` / `MT_CLIENT_CPUS` | Override CPU lists |
| `MT_UPSTREAM_LATENCY_MS` | Fixed or `min-max` delay in mock before respond |

Needs a machine with enough cores that roles do not overlap. On a 2-CPU host, pinning is skipped (`nproc<3`) — processes still contend and tails stay polluted.

## Publish posture

**Solid now:** tokens, per-call overhead (`ms/call` p50), medians, memory/RSS, task_success.

**p999:** labeled via `p999_status` — `under_rework` / `harness_isolated_pending_full_board` until a full interleaved 10k with separate mock **and** pinned cores lands (`isolated_remeasure`). Do not headline peer or ClawQL p999 from pre-isolation boards.

Publish metric remains **client e2e** p999 once cleared; server `queue_ms` / upstream handle ms stay diagnostic only.

## Next

1. Full interleaved board, every arm, `MT_PIN_CORES=1`, record `core_layout`.
2. Optional arm with `MT_UPSTREAM_LATENCY_MS=20-100` — shows how gateway own-tail shrinks when real network time dominates.
