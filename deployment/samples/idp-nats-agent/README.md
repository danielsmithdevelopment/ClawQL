# IDP NATS agent bridge (Hermes / Pi / Goose / OpenClaw)

**Tracking:** [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)

ClawQL-Agent is not required to close the async IDP loop. This sample pairs:

1. **ClawQL NATS workers** — inbox → `run_idp_pipeline` (already in Helm)
2. **`npm run nats:agent-bridge`** — subscribes to `pipeline.completed|failed` + `coneshare.viewer`, calls ClawQL MCP (`memory_ingest` / `notify` / `audit`)
3. **Hermes or Pi** — use ClawQL as an MCP server for interactive tools; load the skill below so the model does not invent a second queue

Contract: [`docs/openclaw/clawql-agent-idp-nats.md`](../../../docs/openclaw/clawql-agent-idp-nats.md)

## Why Hermes / Pi (not OpenClaw)

| Runtime | Fit for this bridge |
|---------|---------------------|
| **Hermes** | Native MCP + skills; load [`hermes/SKILL.md`](hermes/SKILL.md) |
| **Pi** | Minimal TS harness; drop in [`pi/clawql-idp.ts`](pi/clawql-idp.ts) extension |
| **Goose** | Helm already wires `CLAWQL_MCP_URL` — same MCP tools |
| **OpenClaw** | Full chat gateway; heavier — use when you already run Agent Chat |

## Run the bridge

```bash
export CLAWQL_NATS_URL=nats://localhost:4222
export CLAWQL_NATS_JETSTREAM=1
export CLAWQL_NATS_ENABLE_CONSUMER=1
export CLAWQL_NATS_AGENT_BRIDGE=1
export CLAWQL_MCP_HTTP_URL=http://127.0.0.1:8080/mcp
# optional on pipeline.failed:
# export CLAWQL_NATS_AGENT_BRIDGE_NOTIFY_CHANNEL=C01234567

npm run nats:agent-bridge
```

Durable consumer: `clawql-idp-agent-bridge` (override with `CLAWQL_NATS_AGENT_BRIDGE_DURABLE`).

## Hermes

1. Point Hermes MCP at ClawQL Streamable HTTP (`…/mcp`).
2. Install / paste [`hermes/SKILL.md`](hermes/SKILL.md) as a Hermes skill.
3. Run the bridge process alongside Hermes (or in-cluster next to `nats-worker`).

## Pi

1. Configure Pi MCP servers to include ClawQL HTTP `/mcp`.
2. Copy [`pi/clawql-idp.ts`](pi/clawql-idp.ts) into your Pi extensions folder (or symlink).
3. Run `npm run nats:agent-bridge` for async follow-up.

## Related

- [nats-idp-e2e.md](../../../docs/runbooks/nats-idp-e2e.md)
- [nats-keda-worker.md](../../../docs/deployment/nats-keda-worker.md)
