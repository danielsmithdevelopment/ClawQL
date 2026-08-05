# IDP pipeline smoke (B-2.3)

Proves **real document services** (at least Tika + Gotenberg via Docker Compose), not the OpenBench stub.

The stub cell [`idp-safe-pipeline-lite`](../benchmarks/openbench-task-explanations.md#idp-safe-pipeline-lite) only proves agent tool orchestration with fake Onyx/Slack. Useful as a cheap regression, **not** as proof that IDP works.

**Script:** [`scripts/dev/smoke-idp-pipeline-b23.sh`](../../scripts/dev/smoke-idp-pipeline-b23.sh)  
**Workflow:** [`.github/workflows/idp-pipeline-smoke.yml`](../../.github/workflows/idp-pipeline-smoke.yml)

---

## What each tier proves

| Tier                  | Real services?             | Proves                                                   | Missing                                    |
| --------------------- | -------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| **stub** (OpenBench)  | No                         | Agent can sequence ClawQL tools                          | Any real PDF/vendor hop                    |
| **offline**           | No                         | Helm NATS wiring + `run_idp_pipeline` dry_run unit tests | Network I/O to vendors                     |
| **compose** (default) | **Yes — Tika + Gotenberg** | Containers up; Tika actually parses text                 | Stirling, Nextcloud, Onyx, ConeShare, Argo |
| **live**              | Yes — your cluster/HTTP    | Webhook dry_run against deployed ClawQL                  | Needs GitHub secrets                       |

**Recommended proof path:** land **compose** green on every B2.3 PR → later add Stirling to compose → then **live** with staging secrets for full chain.

---

## Local

```bash
# Real Tika + Gotenberg (needs Docker)
IDP_SMOKE_TIER=compose bash scripts/dev/smoke-idp-pipeline-b23.sh

# Wiring only
IDP_SMOKE_TIER=offline bash scripts/dev/smoke-idp-pipeline-b23.sh

# Deployed MCP HTTP (port-forward / staging)
export CLAWQL_HTTP_BASE=http://127.0.0.1:8080
export CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN=…
export CLAWQL_CONESHARE_WEBHOOK_TOKEN=…
IDP_SMOKE_TIER=live bash scripts/dev/smoke-idp-pipeline-b23.sh
```

Artifacts: `artifacts/idp-b23-smoke/` (`pipeline-smoke.json`, `summary.json`).

---

## GitHub Actions

- **PR** (when smoke/script/compose paths change): always **compose**
- **Weekly schedule**: **compose**
- **Dispatch**: pick offline / compose / live (live falls back to compose if secrets missing)

### Live secrets

| Secret                           | Purpose                       |
| -------------------------------- | ----------------------------- |
| `CLAWQL_HTTP_BASE`               | ClawQL MCP HTTP base URL      |
| `CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN` | `POST /idp/nextcloud/webhook` |
| `CLAWQL_CONESHARE_WEBHOOK_TOKEN` | `POST /idp/coneshare/webhook` |

---

## Next increments

1. Add **Stirling** to the compose overlay (redact hop).
2. Gated non-dry_run against staging (Nextcloud inbox → processed → Onyx → ConeShare).
3. Optional OpenBench B-2.2 (failure + Ouroboros) — separate from this smoke.
