# Multi-gateway equal-arm comparison

Live board across MCP gateways that sit in the same product neighborhood as ClawQL:

| Arm | Role |
| --- | --- |
| **ClawQL** | OpenAPI `execute` (search+execute stack) |
| **Executor** | Code `execute` (Layer-1 peer) |
| **MCPJungle** | Self-hosted MCP aggregator (`/mcp`) |
| **agentgateway** | AAIF/LF MCP federation proxy |
| **ContextForge** | IBM registry + virtual MCP server |
| **MetaMCP** | Namespace aggregator (skipped without Docker) |

## Equal-arm contract

- Same two-pet JSON payload (`Ada` / `Grace`).
- Aggregators call stdio upstream `equal-arm-pets-mcp` (`list_pets`) — no network hop (upstream ≈ 0).
- ClawQL hits OpenAPI mock HTTP; `gateway_cost = e2e − direct`.
- Executor returns pets in-process; `gateway_cost ≈ e2e`.
- Chaos: concurrent MCP clients until p99 > 100ms or error_rate > 2%, then binary refine (tol=1).
- Panguard / durable WORM off.

## Run

```bash
# binaries (once)
mkdir -p /tmp/gw-bins
curl -sL https://github.com/mcpjungle/MCPJungle/releases/download/0.4.6/mcpjungle_Linux_x86_64.tar.gz \
  | tar -xz -C /tmp/gw-bins
curl -sL -o /tmp/gw-bins/agentgateway \
  https://github.com/agentgateway/agentgateway/releases/download/v1.6.0/agentgateway-linux-amd64
chmod +x /tmp/gw-bins/*

export EXECUTOR_BIN=/path/to/executor
export EXECUTOR_CWD=/path/to/executor/cwd
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway
export PATH="$HOME/.local/bin:$PATH"   # uv/uvx for ContextForge

MULTI_ITERS=200 MULTI_CHAOS_MAX=32 \
  npm run benchmark:gateway-multi-comparison
```

Artifact: `gateway-multi-cmp.json` (board + per-arm latency/resources/tokens/chaos).

## Honesty

Multi-arm results are **host-bound** (this VM). Hold publicizing until ClawQL vs Executor RAM gap is closed or scoped; treat other arms as exploratory until repeated on a dedicated bench host. MetaMCP requires Docker Compose and is skipped when Docker is absent.
