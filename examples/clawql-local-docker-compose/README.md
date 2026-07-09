# Tier 1 Docker Compose

Local full stack: **ClawQL MCP (HTTP)** + **Tika** + **Gotenberg** + **Paperless NGX** + **Redis** + **Postgres**, with vault memory and PageIndex enabled by default.

Tracking: [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251) · Design: [`docs/design/operator-target-architecture.md`](../../docs/design/operator-target-architecture.md) §1.

## Quick start

```bash
cd examples/clawql-local-docker-compose
chmod +x bootstrap.sh
./bootstrap.sh
docker compose up -d --build
curl -fsS http://localhost:8080/healthz
```

## Optional Presidio

```bash
# Add CLAWQL_ENABLE_PRESIDIO=1 to .env after bootstrap, or use the override file:
docker compose -f docker-compose.yml -f docker-compose.presidio.override.yml up -d
```

Set `documents.presidio.enabled: true` in `clawql.local.yaml` when using Presidio.

## Smoke / CI

```bash
./tests/compose-config-test.sh
```

From repo root: `make compose-tier1-config-test`

## Files

| File | Purpose |
|------|---------|
| `bootstrap.sh` | Prerequisites, `.env`, `clawql.local.yaml`, local secrets |
| `docker-compose.yml` | Base Tier 1 stack |
| `docker-compose.presidio.override.yml` | Optional analyzer + anonymizer |
| `clawql.local.yaml` | Generated local config (editable) |

For Kubernetes parity, use `make local-k8s-up` and [`charts/clawql-mcp`](../../charts/clawql-mcp).
