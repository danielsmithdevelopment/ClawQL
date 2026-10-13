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

## Isolated 10k result

Artifact: [`gateway-multi-multiturn-publish-all-arms-isolated-10k.json`](./gateway-multi-multiturn-publish-all-arms-isolated-10k.json) (`p999_status=isolated_remeasure`, `core_layout` mock=`0` / gateway=`1` / client=`2`, nproc=4).

| Observation | Detail |
| --- | --- |
| Peer tails shrank | MCPJungle flow p999 **287→117**; agentgateway **208→82** — confirms harness coupling polluted shared-mock arms |
| ClawQL HTTP tails did not | Bun **461→715**; Node **443→588** — remaining spike is gateway/client side under isolation, not mock loop sharing |
| Medians stable | Bun HTTP p50 **~33 ms**; ms/call **~1.29** vs peers **~1.23–1.30** |
| Mock process | separate pid; **840 001** upstream requests; max handle **~9.6 ms**; tcp_connects **9** |
| Host caveat | 4 CPUs — roles do not overlap, but the machine is small; re-run on a larger dedicated host before external video |

Smoke (2 iters, same pin layout): [`gateway-multi-multiturn-harness-iso-smoke2.json`](./gateway-multi-multiturn-harness-iso-smoke2.json).

## Realistic upstream hook (smoke)

`MT_UPSTREAM_LATENCY_MS=20-100` applies to the HTTP mock **and** the stdio catalog MCP (peer backends). Smoke n=20 HTTP peers: [`gateway-multi-multiturn-upstream-latency-smoke20.json`](./gateway-multi-multiturn-upstream-latency-smoke20.json).

| Arm | ms/call p50 | Flow e2e p50 |
| --- | ---: | ---: |
| Direct | 57 | 738 |
| ClawQL Bun HTTP | 33† | 779 |
| MCPJungle | 64 | 761 |
| agentgateway | 61 | 749 |

† ClawQL still does 2 RPCs/turn; only execute pays upstream delay, so ms/call ≈ turn/2. Session medians converge once injected latency dominates — the useful buyer-facing follow-up board (full 10k optional).

## Next

1. Full `MT_UPSTREAM_LATENCY_MS=20-100` interleaved board when product wants the “network dominates” slide.
2. Re-measure zero-latency tails on a host with ≥6–8 dedicated cores if ClawQL HTTP p999 stays elevated.
