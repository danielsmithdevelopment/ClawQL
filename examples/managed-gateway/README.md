# Managed Edge Gateway

One hostname for **OpenAI-compatible `/v1`**, **MCP `/mcp`**, and **vault memory** —
the go-live wedge for ClawQL’s Managed Edge Gateway (local / self-hosted).

**Secure defaults:** virtual key required on `/v1`; MCP uses `CLAWQL_AUTH_MODE=apiKey`
with the same key. Never `noAuth` on networked surfaces.

**Docs:** [Get started — inference](../../docs/getting-started/inference.md)

## Quick start (recommended)

From a ClawQL checkout after `npm ci && npm run build`:

```bash
# Process profile — no Docker build required
export DEEPSEEK_API_KEY=sk-…   # or another BYOK key
clawql gateway create --profile process --team demo

# Printed once:
#   MCP URL:       http://127.0.0.1:8080/mcp
#   Inference URL: http://127.0.0.1:8080/v1
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
cd examples/managed-gateway
docker compose --env-file .env up -d --build
```

Or let create start compose (requires Docker):

```bash
clawql gateway create --profile local-docker --team demo
```

## Layout

| Path | Role |
|------|------|
| `docker-compose.yml` | nginx gateway + MCP + inference |
| `nginx.conf` | `/mcp` → MCP, `/v1` → inference, `/healthz` |
| `gateway-proxy.mjs` | same routing for process profile |
| `policy.yaml` | inference policy with `keys.enabled: true` |

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
