# Personal agent (Hermes + Cline) — local ClawQL wiring

Operator guide: [`docs/homelab/personal-agent-hermes-cline.md`](../../docs/homelab/personal-agent-hermes-cline.md)

## Ports

| Port | Process                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 8080 | ClawQL MCP (`scripts/dev/start-clawql-for-personal-agent.sh`)                                            |
| 8082 | MLX Ornith (`scripts/dev/start-ornith-mlx-for-personal-agent.sh`) — do **not** start Harvey LAB MCP here |
| 8091 | clawql-inference (`scripts/dev/start-clawql-inference-for-personal-agent.sh`)                            |
| 8081 | optional Nemotron fallback (leave running if already up)                                                 |

## Cline MCP snippet

Point Cline at ClawQL MCP. File/terminal stay Cline-native; WORM hooks are in `clawql-agents`.

```json
{
  "mcp": {
    "servers": [
      {
        "name": "clawql",
        "url": "http://127.0.0.1:8080/mcp",
        "enabled": true
      }
    ]
  },
  "model": {
    "provider": "openai-compatible",
    "baseUrl": "http://127.0.0.1:8091/v1",
    "apiKey": "local",
    "modelId": "openai/ornith-1.5-35b-a3b"
  }
}
```

The gateway aliases `openai/ornith-1.5-35b-a3b` and `ornith-1.5-35b-a3b` to the **mlx** provider (`CLAWQL_MLX_BASE_URL`, default `:8082`).

## Loki (audit + inference streams)

Personal start scripts default **`CLAWQL_LOKI_PUSH_URL=http://127.0.0.1:3100/loki/api/v1/push`**.

```bash
docker compose -f examples/personal-agent/docker-compose.loki.yml up -d
```

Grafana Explore (LogQL range query — Loki 3 rejects instant log queries):

- `{job="clawql-audit"}` — MCP `audit.append`, including automatic rows for `memory_ingest`, `memory_recall`, `search`, `execute`, …
- `{job="clawql-inference"}` — inference call-store metadata (model, latency, token counts; no prompt/response bodies)

```bash
curl -sG http://127.0.0.1:3100/loki/api/v1/query_range \
  --data-urlencode 'query={job="clawql-audit"}' \
  --data-urlencode 'limit=50'
```

Set **`CLAWQL_ENABLE_LOKI_PUSH=0`** to disable. Inference still writes `~/.ClawQL/PersonalAgent/call-store/calls.jsonl`.

## MCP tools Cline/Hermes can call today

With `CLAWQL_ENABLE_DATA=1` and `CLAWQL_ENABLE_WEB=1`: `memory_recall`, `memory_ingest`, `data_query` / **`clawql_sql`**, `web_search`, `search`, `execute`, `audit`, `cache`.

## Install packaged hooks (from clawql-agents)

```bash
# After npm run build -w clawql-agents
HERMES_EXTENSIONS_DIR=~/.hermes/personal/extensions \
CLINE_CONFIG_PATH=~/.cline/config.json \
bash scripts/dev/install-personal-agent-hooks.sh
```

Copies `worm_agent.py`, writes Cline MCP config + hook stub, and drops `hermes.runtime.snippet.yaml` to merge into `hermes.yaml`.

Offline soak (no Mac Mini required):

```bash
bash scripts/dev/soak-personal-agent-adapters.sh
```
