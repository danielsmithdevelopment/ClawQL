# Multi-gateway equal-arm comparison

Live board (this VM) across MCP gateways in ClawQL’s product neighborhood.

Artifact: [`gateway-multi-cmp.json`](./gateway-multi-cmp.json).

## Board (p99 ≤ 100 ms SLO for chaos)

| Arm | Model | e2e p50 / p95 / p99 / p999 (ms) | Gateway cost p50 / p99 | RSS med (MB) | CPU med % | Schema tok | Tools | Result tok | Chaos last ok | First break |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **ClawQL** | stdio OpenAPI `execute` | **1.72 / 2.39 / 3.40 / 167** | **1.28 / 2.94** | 349 | 119 | 5334† | 18† | 59 | **62** | **63** (p99~113) |
| **Executor** | stdio code `execute` | 2.33 / 4.45 / 5.38 / 8.93 | 2.33 / 5.38 | 242 | 50 | 2243 | 7 | 59 | **24** | **25** (p99~117) |
| **MCPJungle** | HTTP → stdio pets | **1.02 / 1.96 / 3.65 / 9.66** | ≈ e2e | **110** | 79 | **47** | 1 | 28 | ≥128‡ | — |
| **agentgateway** | HTTP → stdio pets | **0.67 / 1.51 / 4.72 / 17.4** | ≈ e2e | 196 | **29** | **38** | 1 | 28 | ≥128‡ | — |
| **ContextForge** | virtual MCP → MCPJungle → pets | 17.5 / 22.5 / 28.3 / 33.1 | ≈ e2e | 698 | 77 | 48 | 1 | 28 | **1** | **2** (p99~282) |
| **MetaMCP** | — | skipped | — | — | — | — | — | — | — | Docker Compose–first; no Docker here |

† ClawQL `tools/list` here is the **full MCP surface** (all registered tools), not the execute-only schema diet in `executor-cmp-comprehensive`.  
‡ Held through `MULTI_CHAOS_MAX=128` extend run (not proven absolute ceiling). ClawQL/Executor ceilings binary-refined (tol=1).  
Latency/RSS/tokens: n=200 primary run. Chaos ceilings for ClawQL/MCPJungle/agentgateway: extend artifact `gateway-multi-cmp-chaos-extend.json`.

## Equal-arm contract

- Same two-pet JSON (`Ada` / `Grace`).
- Aggregators call stdio `equal-arm-pets-mcp` (`list_pets`) — upstream ≈ 0.
- ClawQL OpenAPI `execute` → mock HTTP; `gateway_cost = e2e − direct`.
- Executor returns pets in-process; `gateway_cost ≈ e2e`.
- ContextForge uses MCPJungle as StreamableHTTP adapter (CF’s client rejects bare Node StreamableHTTP); rate limiting disabled for the bench. Nested hop inflates latency/RSS/chaos.
- Panguard / durable WORM off.

## Run

```bash
mkdir -p /tmp/gw-bins
curl -sL https://github.com/mcpjungle/MCPJungle/releases/download/0.4.6/mcpjungle_Linux_x86_64.tar.gz \
  | tar -xz -C /tmp/gw-bins
curl -sL -o /tmp/gw-bins/agentgateway \
  https://github.com/agentgateway/agentgateway/releases/download/v1.6.0/agentgateway-linux-amd64
chmod +x /tmp/gw-bins/*

export EXECUTOR_BIN=… EXECUTOR_CWD=…
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway
export PATH="$HOME/.local/bin:$PATH"   # uv/uvx for ContextForge

MULTI_ITERS=200 MULTI_CHAOS_MAX=32 \
  npm run benchmark:gateway-multi-comparison
```

## Honesty / publish hold

- Host-bound exploratory board — repeat on a dedicated bench host before publicizing.
- Hold publicizing until ClawQL vs Executor **RAM** gap is closed or scoped (same as Executor comprehensive board).
- Do not compare aggregator single-tool schema tokens to ClawQL’s full multi-tool surface without saying so.
- MetaMCP omitted without Docker.
