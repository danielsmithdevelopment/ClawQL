# Managed Edge Gateway

One hostname for **OpenAI-compatible `/v1`**, **MCP `/mcp`**, **vault `/memory`**,
and **Fast Decision `/decision`** (alias `/v1/systemone`) — the go-live wedge for
ClawQL’s Managed Edge Gateway (local / self-hosted).

**Secure defaults:** virtual key required on `/v1` (and `/memory`, `/decision`);
MCP uses `CLAWQL_AUTH_MODE=apiKey` and accepts the same inference virtual key
(`tenantId` from `key.team`). Never `noAuth` on networked surfaces.

**Docs:** [Get started — inference](../../getting-started/inference.md) ·
[Gateway ladder spec](../../specs/inference/gateway-ladder-v0.1.md)

## Quick start (recommended)

From a ClawQL checkout after `npm ci && npm run build`:

```bash
# Process profile — no Docker build required
export DEEPSEEK_API_KEY=sk-…   # or another BYOK key
clawql gateway create --profile process --team demo

# Printed once:
#   MCP URL:       http://127.0.0.1:8080/mcp
#   Inference URL: http://127.0.0.1:8080/v1
#   Memory URL:    http://127.0.0.1:8080/memory
#   Decision URL:  http://127.0.0.1:8080/decision
#   Virtual key:   clawql-vk-…
```

Client:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
export OPENAI_API_KEY=clawql-vk-…   # the printed secret
```

Stop:

```bash
clawql gateway destroy --yes
```

## Docker profile

```bash
clawql gateway create --profile local-docker --team demo --no-start
cd docs/examples/managed-gateway
docker compose --env-file .env up -d --build
```

Or let create start compose (requires Docker):

```bash
clawql gateway create --profile local-docker --team demo
```

## Layout

| Path                 | Role                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `docker-compose.yml` | nginx gateway + MCP + inference                                     |
| `nginx.conf`         | `/mcp` → MCP; `/v1`, `/memory`, `/decision` → inference; `/healthz` |
| `gateway-proxy.mjs`  | same routing for process profile                                    |
| `policy.yaml`        | inference policy with `keys.enabled: true`                          |

## Security checklist

- [x] `CLAWQL_AUTH_MODE=apiKey` (not `noAuth`)
- [x] `CLAWQL_INFERENCE_KEYS_ENABLED=1`
- [x] MCP and inference not published on host ports (Docker) — only the gateway
- [x] Vault memory enabled (`CLAWQL_ENABLE_MEMORY=1`)
- [ ] Production: put JWT ATR / mcpProxy in front of `/mcp` (see defense-in-depth docs)
- [ ] Production: tenant from validated token only — Managed Gateway uses virtual-key `team`

## Validate compose (offline)

```bash
./tests/compose-config-test.sh
```
