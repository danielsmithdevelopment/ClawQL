# IDP pipeline smoke (B-2.3)

Scheduled / manual integration smoke for the **live-vendor IDP path**. Complements the OpenBench stub cell [`idp-safe-pipeline-lite`](../benchmarks/openbench-task-explanations.md#idp-safe-pipeline-lite) (retired WIN) — this runbook is **not** `pr_active`.

**Script:** [`scripts/dev/smoke-idp-pipeline-b23.sh`](../../scripts/dev/smoke-idp-pipeline-b23.sh)  
**Workflow:** [`.github/workflows/idp-pipeline-smoke.yml`](../../.github/workflows/idp-pipeline-smoke.yml)  
**Related:** [nats-idp-e2e.md](./nats-idp-e2e.md) · [idp-pipeline-runner.md](../mcp/idp-pipeline-runner.md) · [idp-pipeline.md](../providers/idp-pipeline.md)

---

## Tiers

| Tier      | What it proves                                                                    | Needs                          |
| --------- | --------------------------------------------------------------------------------- | ------------------------------ |
| `offline` | Helm NATS IDP templates + vitest `run_idp_pipeline` dry_run + stage plan artifact | `helm`, `npm ci`               |
| `compose` | offline + local **Tika** / **Gotenberg** health + Tika PUT parse                  | Docker + compose from examples |
| `live`    | offline + HTTP Nextcloud/ConeShare webhook dry_run against a running ClawQL HTTP  | Secrets (see below)            |

Default schedule runs **`offline`**. Dispatch can select any tier. Live without secrets falls back to **compose**.

---

## Local

```bash
# Offline wiring (CI default)
bash scripts/dev/smoke-idp-pipeline-b23.sh

# Local document hops
IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh

# Against a port-forwarded / deployed MCP HTTP
export CLAWQL_HTTP_BASE=http://127.0.0.1:8080
export CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN=…
export CLAWQL_CONESHARE_WEBHOOK_TOKEN=…
IDP_SMOKE_TIER=live bash scripts/dev/smoke-idp-pipeline-b23.sh
```

Artifacts land under `artifacts/idp-b23-smoke/` (`pipeline-smoke.json`, `summary.json`).

---

## GitHub Actions secrets (live tier)

| Secret                           | Purpose                                   |
| -------------------------------- | ----------------------------------------- |
| `CLAWQL_HTTP_BASE`               | Base URL of ClawQL MCP HTTP (e.g. tunnel) |
| `CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN` | Auth for `POST /idp/nextcloud/webhook`    |
| `CLAWQL_CONESHARE_WEBHOOK_TOKEN` | Auth for `POST /idp/coneshare/webhook`    |

Optional later (full vendor matrix, not yet gated in this smoke): `STIRLING_BASE_URL`, `NEXTCLOUD_*`, `ONYX_*`, `CONESHARE_*`, Argo kubeconfig.

---

## Honest scope

| Proves                                            | Does **not** prove                                       |
| ------------------------------------------------- | -------------------------------------------------------- |
| Helm NATS IDP + KEDA consumer wiring              | Full seven-stage live Stirling→ConeShare on every PR     |
| `run_idp_pipeline` dry_run + DEFAULT recipe opIds | OpenBench A/B delta (use stub cell)                      |
| Local Tika/Gotenberg reachability                 | Docling / Paperless / Onyx / ConeShare VDR live hops     |
| Remote webhook dry_run when secrets set           | Non-dry_run production redact + archive + VDR end-to-end |

Next increments: add Stirling to compose tier; gated non-dry_run against a staging cluster; optional B-2.2 failure+Ouroboros cell on OpenBench.
