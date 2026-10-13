# Stall + Ready memory — round 9

Follow-up to [`stall-memory-round8.md`](./stall-memory-round8.md).

## What isolation proved

Round 8 separated the harness’s tail from ClawQL’s own. Peer flow p999 roughly halved (MCPJungle **287→117**, agentgateway **208→82**). ClawQL HTTP p999 got **worse** (Bun **461→715**, Node **443→588**) under a **1-core** gateway pin.

Hypothesis: V8/JSC helper threads (background compile + concurrent GC) contend with the main thread on a 1-core pin — matching prior `futex` waits and ~78% idle during in-handler stalls. Go/Rust adapt; JS may not.

## Test A — gateway gets two cores

Default when `MT_PIN_CORES=1` and `nproc≥4`: mock=`0`, gateway=`1-2`, client=`3` (same for every arm). Production almost always has ≥2 vCPUs.

Artifact: [`gateway-multi-multiturn-publish-all-arms-gw2core-10k.json`](./gateway-multi-multiturn-publish-all-arms-gw2core-10k.json) vs 1-core [`…-isolated-10k.json`](./gateway-multi-multiturn-publish-all-arms-isolated-10k.json).

| Arm | 1c p999 | 2c p999 | Δ |
| --- | ---: | ---: | ---: |
| ClawQL Node stdio | 92 | **62** | **−31** |
| ClawQL Bun stdio | 41 | **36** | −5 |
| ClawQL Node HTTP | 588 | 669 | +81 |
| ClawQL Bun HTTP | 715 | 759 | +44 |
| MCPJungle | 117 | **61** | **−56** |
| agentgateway | 82 | **76** | −6 |
| Executor v1 | 188 | **131** | **−56** |

**Verdict:** 2 cores helps **stdio** ClawQL and several peers. It does **not** drop ClawQL **HTTP** p999 — so the remaining HTTP spike is not “just starve V8 of a second core.” Keep `gateway_2core` as the fair default layout anyway; cite medians/tokens; treat HTTP p999 as still open.

## Test B — Node `--single-threaded` (diagnosis only)

`MT_NODE_SINGLE_THREADED=1` → Node `--single-threaded --single-threaded-gc` on a forced 1-core gateway pin. n=3000 Node HTTP:

| Condition | flow p50 | flow p999 |
| --- | ---: | ---: |
| 1-core control | 40.5 | **411** |
| 1-core + V8 single-threaded | 44.2 | **519** |

**Verdict:** serializing background GC/compile onto the main thread did **not** shrink the 1-core HTTP tail (got worse at this n). Not a production setting. Bun has no harness equivalent — rely on Test A for Bun.

Artifacts: [`…-1core-control-3k.json`](./gateway-multi-multiturn-clawql-http-1core-control-3k.json), [`…-1core-v8single-3k.json`](./gateway-multi-multiturn-clawql-http-1core-v8single-3k.json).

## Buyer framing — realistic upstream

With `MT_UPSTREAM_LATENCY_MS=20-100`, session medians land ~**740–780 ms** across gateways (**~5%** band). Smoke: [`gateway-multi-multiturn-upstream-latency-smoke20.json`](./gateway-multi-multiturn-upstream-latency-smoke20.json).

**Honest real-world line:** once an actual API sits behind the gateway, gateway latency is a rounding error; token cost is not (~**4×** fewer tokens on ClawQL known-op vs pass-through peers). Prefer that story over any lab p999.

## Knobs

| Env | Role |
| --- | --- |
| `MT_PIN_CORES=1` | Enable pin; default `gateway_2core` when nproc≥4 |
| `MT_GATEWAY_CPUS=1-2` | Explicit gateway list (same for every arm) |
| `MT_NODE_SINGLE_THREADED=1` | Diagnostic V8 single-thread GC/compile |

## Next

HTTP tail remains open under isolation + 2-core pin. Do not chase production defaults from the failed single-threaded probe. Prefer buyer framing (tokens + realistic upstream) until a larger dedicated host remeasures HTTP p999.

**Settled (not NATS/Redis/Wasm for this tail):** ≥2 CPUs per gateway process in Helm/deploy docs; fusion measured on multi-lookup tasks; catalog/IDP memory via colocated SQLite — see [`docs/architecture/gateway-runtime-and-catalog-memory.md`](../../architecture/gateway-runtime-and-catalog-memory.md).