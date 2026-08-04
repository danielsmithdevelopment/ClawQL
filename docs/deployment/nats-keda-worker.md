# NATS JetStream worker + KEDA autoscaling ([#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257))

Scale **HITL resume** and **document** JetStream consumers independently of the MCP HTTP pod using a dedicated **NATS worker Deployment** and a **KEDA `ScaledObject`** on consumer lag.

**Related:** [NATS JetStream (Helm)](helm.md#nats-jetstream-deep-dive) · [HITL Label Studio](../mcp/hitl-label-studio.md) · [IDP pipeline runner](../mcp/idp-pipeline-runner.md) · [Workflow tool](../mcp/workflow-tool.md) · [#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254) (publish/consumer)

---

## Architecture

```text
clawql-mcp-http  --publish-->  JetStream (CLAWQL_WORKFLOW)
   │                                │
   │  clawql.workflow.hitl.*        ├──► clawql-hitl-resume
   │  clawql.document.inbox.*       ├──► clawql-idp-pipeline (+ -requested)
   │  clawql.document.coneshare.*   └──► clawql-coneshare-followup
   │                                         │
   │                                    KEDA ScaledObject (HITL durable lag)
   │                                         │
   └──── embeddedConsumer (optional)    nats-worker (N replicas)
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
             Argo resume              run_idp_pipeline           Coneshare resume
             (HITL)                   (+ hop/terminal publish)   + optional Slack
```

- **MCP pod:** publishes lifecycle events when `nats.appIntegration.publish=true` ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)). Webhooks: `POST /idp/nextcloud/webhook`, `POST /idp/coneshare/webhook`.
- **Worker pod(s):** run `node node_modules/clawql-automation/dist/nats/cli.js` — no HTTP listener.
- **KEDA:** scales workers on lag for durable consumer **`clawql-hitl-resume`** (configurable). Document durables share the worker Deployment; enable with Helm flags below.
- **Bootstrap Job:** pre-creates stream + selected durables so KEDA can read lag before scale-from-zero.

---

## Prerequisites

1. **KEDA** installed in the cluster ([keda.sh](https://keda.sh/docs/latest/deploy/)) when using `nats.keda.enabled`.
2. **In-cluster NATS** with JetStream (`nats.enabled=true`) — KEDA reads the NATS **monitoring** port (`8222`).
3. At least one consumer purpose:
   - **`enableWorkflow=true`** — HITL resume on `hitl.completed`, and/or
   - **`nats.worker.idpPipeline=true`** — Nextcloud inbox → `run_idp_pipeline`, and/or
   - **`nats.worker.coneshareFollowup=true`** — Coneshare viewer → resume/notify.

---

## Helm enable

### HITL + KEDA (original)

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

### Document consumers (IDP + Coneshare)

```bash
helm upgrade --install clawql charts/clawql-mcp -n clawql \
  --set envFromSecret=clawql-provider-env \
  --set nats.enabled=true \
  --set nats.appIntegration.publish=true \
  --set nats.worker.enabled=true \
  --set nats.worker.idpPipeline=true \
  --set nats.worker.coneshareFollowup=true \
  --set enableIdpPipeline=true \
  --set enableDocuments=true
```

| Value                                  | Default | Purpose                                                |
| -------------------------------------- | ------- | ------------------------------------------------------ |
| `nats.worker.enabled`                  | `false` | Separate consumer Deployment                           |
| `nats.worker.idpPipeline`              | `false` | `CLAWQL_NATS_CONSUMER_IDP_PIPELINE=1`                  |
| `nats.worker.coneshareFollowup`        | `false` | `CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP=1`            |
| `nats.worker.mcpInternalUrl`           | chart   | `CLAWQL_MCP_INTERNAL_URL` for `POST /idp/pipeline/run` |
| `nats.keda.enabled`                    | `false` | KEDA `ScaledObject` on JetStream lag                   |
| `nats.keda.lagThreshold`               | `5`     | Target messages per replica                            |
| `nats.keda.minReplicaCount`            | `0`     | Scale to zero when idle                                |
| `nats.keda.maxReplicaCount`            | `10`    | Upper bound                                            |
| `nats.keda.bootstrapConsumer`          | `true`  | Helm hook Job creates durable consumer(s)              |
| `nats.appIntegration.embeddedConsumer` | `true`  | In-process consumer on MCP when worker off             |

When **`nats.worker.enabled=true`**, the MCP Deployment does **not** set `CLAWQL_NATS_ENABLE_CONSUMER` — only the worker Deployment consumes.

---

## Local / non-Helm

```bash
# Terminal 1 — MCP with publish + webhooks
export CLAWQL_NATS_URL=nats://localhost:4222
export CLAWQL_NATS_JETSTREAM=1
export CLAWQL_NATS_ENABLE_PUBLISH=1
export CLAWQL_ENABLE_IDP_PIPELINE=1
export CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN=dev-token
npm run start:http

# Terminal 2 — standalone worker (HITL and/or document)
export CLAWQL_NATS_ENABLE_CONSUMER=1
export CLAWQL_NATS_CONSUMER_IDP_PIPELINE=1
export CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP=1
export CLAWQL_MCP_INTERNAL_URL=http://localhost:8080
export CLAWQL_IDP_PIPELINE_RUN_TOKEN=dev-token   # if set on MCP
npm run nats:worker
```

Bootstrap consumers:

```bash
export CLAWQL_NATS_URL=nats://localhost:4222
export CLAWQL_NATS_JETSTREAM=1
export CLAWQL_NATS_CONSUMER_IDP_PIPELINE=1
export CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP=1
npm run nats:bootstrap-consumer
```

---

## Subjects & durables

| Subject                              | Durable                         | Handler            |
| ------------------------------------ | ------------------------------- | ------------------ |
| `clawql.workflow.hitl.completed`     | `clawql-hitl-resume`            | Argo resume        |
| `clawql.document.inbox.arrived`      | `clawql-idp-pipeline`           | `run_idp_pipeline` |
| `clawql.document.pipeline.requested` | `clawql-idp-pipeline-requested` | `run_idp_pipeline` |
| `clawql.document.coneshare.viewer`   | `clawql-coneshare-followup`     | resume + Slack     |

Lifecycle (publish-only): `clawql.document.pipeline.hop|completed|failed`.

---

## Verify

```bash
kubectl -n clawql get deploy,scaledobject | rg nats
kubectl -n clawql logs deploy/clawql-mcp-http-nats-worker --tail=50
curl -sS -X POST http://localhost:8080/idp/nextcloud/webhook \
  -H "Authorization: Bearer $CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"document_path":"IDP/inbox/demo.pdf","dry_run":true}'
```

---

## Limits (v1)

- KEDA trigger targets the **HITL resume** durable by default. For document-only lag scaling, point `nats.keda.consumer` at `clawql-idp-pipeline` (or run a second ScaledObject).
- **External NATS** (`nats.url`) without in-cluster monitoring requires a future `nats.keda.monitoringEndpoint` override — use in-cluster NATS for KEDA today.
- Worker shares the MCP **ServiceAccount**; IDP path prefers `CLAWQL_MCP_INTERNAL_URL` → `POST /idp/pipeline/run` when documents deps are not embedded in the worker image process.
