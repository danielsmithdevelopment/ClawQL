# NATS IDP end-to-end enablement

Prove the **document JetStream** path: Nextcloud inbox → `run_idp_pipeline` → (optional) Coneshare viewer follow-up.

**Related:** [nats-keda-worker.md](../deployment/nats-keda-worker.md) · [idp-pipeline-runner.md](../mcp/idp-pipeline-runner.md) · [lending W-2 pack](../../deployment/samples/lending-w2/README.md) · Helm example [`values-nats-idp.example.yaml`](../../charts/clawql-mcp/values-nats-idp.example.yaml) · Agent bridge (Hermes/Pi) [idp-nats-agent-bridge.md](idp-nats-agent-bridge.md)

---

## Architecture (operator view)

```text
Nextcloud Flow / curl
        │
        ▼
POST /idp/nextcloud/webhook  ──publish──►  clawql.document.inbox.arrived
                                                    │
                                                    ▼
                              nats-worker (idpPipeline=true)
                                                    │
                              run_idp_pipeline (dry_run or live)
                                                    │
                              Stirling redact → processed upload → …
                                                    │
ConeShare automation ──► POST /idp/coneshare/webhook
                                                    │
                              clawql.document.coneshare.viewer
                                                    │
                              resume Argo + optional Slack notify
```

---

## 1. Helm enable

### Overlay (lean)

```bash
helm upgrade --install clawql charts/clawql-mcp \
  -f charts/clawql-mcp/values-nats-idp.example.yaml \
  --set envFromSecret=clawql-provider-env \
  --namespace clawql --create-namespace
```

### Full IDP umbrella

`charts/clawql-idp/values-idp-full.yaml` already sets `nats.worker.idpPipeline` + `coneshareFollowup` + publish. Install per [clawql-idp-helm.md](../deployment/clawql-idp-helm.md).

### Secret keys (production)

| Key                               | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN`  | Auth for inbox webhook                      |
| `CLAWQL_CONESHARE_WEBHOOK_TOKEN`  | Auth for viewer webhook                     |
| `CLAWQL_IDP_PIPELINE_RUN_TOKEN`   | Auth for worker → `POST /idp/pipeline/run`  |
| `CLAWQL_IDP_REDACT_LIST`          | Stirling `listOfText` patterns              |
| `CLAWQL_CONESHARE_NOTIFY_CHANNEL` | Optional Slack channel for viewer follow-up |
| `NEXTCLOUD_*` / `CONESHARE_*`     | Vendor base URLs + credentials              |

---

## 2. Offline smoke (no cluster HTTP)

```bash
SMOKE_HELM_ONLY=1 bash scripts/dev/smoke-nats-idp-webhooks.sh
```

Asserts Helm renders IDP + Coneshare consumer env and KEDA triggers for `clawql-idp-pipeline` / `clawql-coneshare-followup` / `clawql-hitl-resume`.

---

## 3. Live webhook smoke

```bash
kubectl -n clawql port-forward svc/clawql-mcp-http 8080:8080 &

export CLAWQL_HTTP_BASE=http://127.0.0.1:8080
export CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN=…   # from Secret
export CLAWQL_CONESHARE_WEBHOOK_TOKEN=…

bash scripts/dev/smoke-nats-idp-webhooks.sh
```

Inbox payload uses **`dry_run: true`** so the consumer plans hops without calling vendors. Check worker logs:

```bash
kubectl -n clawql logs deploy/clawql-mcp-http-nats-worker --tail=80
```

Expect consume of `inbox.arrived` and a terminal `pipeline.completed` / hop publishes when NATS publish is on.

---

## 4. Live pipeline (non-dry-run)

1. Place a PDF at Nextcloud `IDP/inbox/…` (or use lending fixtures).
2. POST webhook **without** `dry_run` (or `dry_run: false`) with `document_path` + `redact_list`.
3. Confirm Stirling hop ran and processed file appears at `processed_path`.
4. Create a ConeShare link with `clawql_share.workflow` for HITL; open the share; webhook should resume / notify.

Pair with [lending-w2](../../deployment/samples/lending-w2/README.md) for Argo suspend/HITL after classify.

---

## 5. KEDA (optional)

With KEDA installed:

```bash
--set nats.keda.enabled=true
```

ScaledObject watches lag on HITL (when `enableWorkflow`) **and** document durables when `idpPipeline` / `coneshareFollowup` are true. Extra durables: `nats.keda.extraConsumers`.

---

## 6. ClawQL-Agent contract

Agents that sit outside this repo should treat document JetStream subjects as the IDP event bus — see [clawql-agent-idp-nats.md](../openclaw/clawql-agent-idp-nats.md) ([#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)).
