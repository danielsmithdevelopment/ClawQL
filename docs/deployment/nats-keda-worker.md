# NATS JetStream worker + KEDA autoscaling ([#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257))

Scale **HITL resume** and other JetStream consumers independently of the MCP HTTP pod using a dedicated **NATS worker Deployment** and a **KEDA `ScaledObject`** on consumer lag.

**Related:** [NATS JetStream (Helm)](helm.md#nats-jetstream-deep-dive) · [HITL Label Studio](../mcp/hitl-label-studio.md) · [Workflow tool](../mcp/workflow-tool.md) · [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254) (publish/consumer)

---

## Architecture

```text
clawql-mcp-http  --publish-->  JetStream (CLAWQL_WORKFLOW)
                                      |
                                      v (lag)
                               KEDA ScaledObject
                                      |
                                      v
                         clawql-mcp-http-nats-worker (N replicas)
                                      |
                                      v
                         workflow resume on hitl.completed
```

- **MCP pod:** publishes lifecycle events when `nats.appIntegration.publish=true` ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).
- **Worker pod(s):** run `node node_modules/clawql-automation/dist/nats/cli.js` — no HTTP listener.
- **KEDA:** scales workers on `num_pending + num_ack_pending` for durable consumer **`clawql-hitl-resume`** (configurable).
- **Bootstrap Job:** pre-creates stream + consumer so KEDA can read lag before scale-from-zero.

---

## Prerequisites

1. **KEDA** installed in the cluster ([keda.sh](https://keda.sh/docs/latest/deploy/)).
2. **In-cluster NATS** with JetStream (`nats.enabled=true`) — KEDA reads the NATS **monitoring** port (`8222`).
3. **`enableWorkflow=true`** — worker calls Argo **`resume`** on `hitl.completed` events.

---

## Helm enable

```bash
helm upgrade --install clawql charts/clawql-mcp -n clawql \
  --set envFromSecret=clawql-provider-env \
  --set nats.enabled=true \
  --set nats.appIntegration.publish=true \
  --set nats.worker.enabled=true \
  --set nats.keda.enabled=true \
  --set enableWorkflow=true \
  --set enableHitlLabelStudio=true
```

| Value                                  | Default | Purpose                                    |
| -------------------------------------- | ------- | ------------------------------------------ |
| `nats.worker.enabled`                  | `false` | Separate consumer Deployment               |
| `nats.keda.enabled`                    | `false` | KEDA `ScaledObject` on JetStream lag       |
| `nats.keda.lagThreshold`               | `5`     | Target messages per replica                |
| `nats.keda.minReplicaCount`            | `0`     | Scale to zero when idle                    |
| `nats.keda.maxReplicaCount`            | `10`    | Upper bound                                |
| `nats.keda.bootstrapConsumer`          | `true`  | Helm hook Job creates durable consumer     |
| `nats.appIntegration.embeddedConsumer` | `true`  | In-process consumer on MCP when worker off |

When **`nats.worker.enabled=true`**, the MCP Deployment does **not** set `CLAWQL_NATS_ENABLE_CONSUMER` — only the worker Deployment consumes.

---

## Local / non-Helm

```bash
# Terminal 1 — MCP with publish only
export CLAWQL_NATS_URL=nats://localhost:4222
export CLAWQL_NATS_JETSTREAM=1
export CLAWQL_NATS_ENABLE_PUBLISH=1
export CLAWQL_ENABLE_WORKFLOW=1
npm run start:http

# Terminal 2 — standalone worker
export CLAWQL_NATS_ENABLE_CONSUMER=1
export CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW=1
npm run nats:worker
```

Bootstrap consumer (for KEDA-style ops):

```bash
export CLAWQL_NATS_URL=nats://localhost:4222
export CLAWQL_NATS_JETSTREAM=1
npm run nats:bootstrap-consumer
```

---

## Verify

```bash
kubectl -n clawql get deploy,scaledobject | rg nats
kubectl -n clawql describe scaledobject clawql-mcp-http-nats-worker
kubectl -n clawql logs deploy/clawql-mcp-http-nats-worker --tail=50
```

Publish a test `hitl.completed` event (or complete a Label Studio task) and confirm worker logs show resume attempts.

---

## Limits (v1)

- KEDA trigger targets the **HITL resume** durable consumer (`clawql-hitl-resume`). Document-pipeline consumers are a follow-up.
- **External NATS** (`nats.url`) without in-cluster monitoring requires a future `nats.keda.monitoringEndpoint` override — use in-cluster NATS for KEDA today.
- Worker shares the MCP **ServiceAccount** and **workflow RBAC** — same namespace allowlist as `enableWorkflow`.
