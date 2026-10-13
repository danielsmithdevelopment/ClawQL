# Stall + Ready memory — round 9

Follow-up to [`stall-memory-round8.md`](./stall-memory-round8.md).

## What isolation proved

Round 8 separated the harness’s tail from ClawQL’s own. Peer flow p999 roughly halved (MCPJungle **287→117**, agentgateway **208→82**). ClawQL HTTP p999 got **worse** (Bun **461→715**, Node **443→588**) under a **1-core** gateway pin.

That pattern is the clue: JavaScript runtimes are not single-threaded underneath. V8 and JavaScriptCore run background threads for compiling hot code and for concurrent GC. Pin the whole process to one core and those helpers compete with the main thread — matching:

| Prior signal | Fit |
| --- | --- |
| Long `futex` waits | Threads waiting on locks / signals |
| ~78% CPU idle during in-handler stalls | Main thread waiting, not working |
| Worse tails on 1 dedicated core than when the process could spread | Helper-thread starvation |

Go/Rust gateways adapt to available cores; a single-core layout penalizes ClawQL’s runtime specifically.

## Test A — gateway gets two cores (fair layout)

Default when `MT_PIN_CORES=1` and `nproc≥4`:

| Role | CPUs |
| --- | --- |
| Mock | `0` |
| Gateway (every arm) | `1-2` |
| Client | `3` |

Production deploys almost always have ≥2 vCPUs. Artifact (full interleaved 10k): [`gateway-multi-multiturn-publish-all-arms-gw2core-10k.json`](./gateway-multi-multiturn-publish-all-arms-gw2core-10k.json). Compare to 1-core isolated board [`…-isolated-10k.json`](./gateway-multi-multiturn-publish-all-arms-isolated-10k.json).

If ClawQL’s HTTP p999 drops sharply with the second core, helper-thread contention was the cause.

## Test B — Node single-threaded V8 (diagnosis only)

`MT_NODE_SINGLE_THREADED=1` adds Node `--single-threaded --single-threaded-gc` (not a production setting). Pair with an explicit 1-core gateway pin (`MT_GATEWAY_CPUS=1`) and compare tails to 1-core without the flags. Shrink ⇒ confirms V8 background work was the 1-core penalty.

Bun: no equivalent public single-thread GC/compile switch in this harness; rely on Test A for Bun arms.

## Buyer framing — realistic upstream

With `MT_UPSTREAM_LATENCY_MS=20-100`, session medians land ~**740–780 ms** across gateways (**~5%** band). Smoke: [`gateway-multi-multiturn-upstream-latency-smoke20.json`](./gateway-multi-multiturn-upstream-latency-smoke20.json).

**Honest real-world line:** once an actual API sits behind the gateway, gateway latency is a rounding error; token cost is not (~**4×** fewer tokens on ClawQL known-op vs pass-through peers). Prefer that story over any p999 number for buyers.

## Knobs

| Env | Role |
| --- | --- |
| `MT_PIN_CORES=1` | Enable pin; default `gateway_2core` when nproc≥4 |
| `MT_GATEWAY_CPUS=1-2` | Explicit gateway list (same for every arm) |
| `MT_NODE_SINGLE_THREADED=1` | Diagnostic V8 single-thread GC/compile |
