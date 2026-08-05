# IDP NATS agent bridge (Hermes / Pi)

**Tracking:** [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)

Closes the **agent-side** of the IDP event bus without requiring the external ClawQL-Agent repo or a full OpenClaw gateway.

## Roles

| Process                       | Role                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| `clawql-mcp-http`             | MCP tools + webhooks (publish)                                   |
| `nats:worker` (`idpPipeline`) | Inbox → `run_idp_pipeline`                                       |
| **`nats:agent-bridge`**       | Terminal / viewer events → `memory_ingest` (+ optional `notify`) |
| **Hermes or Pi**              | Interactive MCP client + skill/extension                         |

```text
inbox.arrived ──► nats-worker ──► pipeline.* events ──► agent-bridge ──► MCP memory/notify
                         ▲                                      │
                         │                                      ▼
              Hermes/Pi (MCP tools) ◄──────────────────── vault / Slack
```

## Enable

### Local

```bash
export CLAWQL_NATS_URL=nats://localhost:4222
export CLAWQL_NATS_JETSTREAM=1
export CLAWQL_NATS_ENABLE_CONSUMER=1
export CLAWQL_NATS_AGENT_BRIDGE=1
export CLAWQL_MCP_HTTP_URL=http://127.0.0.1:8080/mcp

npm run nats:agent-bridge
```

### Helm

`nats.agentBridge.enabled=true` (included in [`values-nats-idp.example.yaml`](../../charts/clawql-mcp/values-nats-idp.example.yaml)) runs Deployment `*-nats-agent-bridge` against in-cluster `/mcp`.

| Env                                       | Default                     | Purpose                    |
| ----------------------------------------- | --------------------------- | -------------------------- |
| `CLAWQL_NATS_AGENT_BRIDGE`                | off                         | Enable bridge consumer     |
| `CLAWQL_NATS_AGENT_BRIDGE_DURABLE`        | `clawql-idp-agent-bridge`   | JetStream durable          |
| `CLAWQL_MCP_HTTP_URL` / `CLAWQL_MCP_URL`  | `http://127.0.0.1:8080/mcp` | Streamable HTTP MCP        |
| `CLAWQL_NATS_AGENT_BRIDGE_NOTIFY_CHANNEL` | —                           | Slack on `pipeline.failed` |

## Runtime setup

Sample skills: [`deployment/samples/idp-nats-agent/`](../../deployment/samples/idp-nats-agent/README.md)

- **Hermes** — [`hermes/SKILL.md`](../../deployment/samples/idp-nats-agent/hermes/SKILL.md)
- **Pi** — [`pi/clawql-idp.ts`](../../deployment/samples/idp-nats-agent/pi/clawql-idp.ts)

## Contract

[`clawql-agent-idp-nats.md`](../openclaw/clawql-agent-idp-nats.md)

## Related

- [nats-idp-e2e.md](nats-idp-e2e.md) — operator webhook prove-out
- [nats-keda-worker.md](../deployment/nats-keda-worker.md) — pipeline consumers
