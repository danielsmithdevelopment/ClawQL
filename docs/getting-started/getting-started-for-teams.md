# Getting started for teams

Run ClawQL as a shared MCP backend for your team: centralize Obsidian memory notes in object storage, seed managed hosts from the same bucket, and wire observability so operators can see health, audit volume, and agent work traces.

**Prerequisites:** Helm Kubernetes (or Tier 1 Compose for a lab slice), [Vault provider secrets](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/vault-provider-secrets.md) synced via External Secrets Operator, and at least one shared bucket (R2, S3, or GCS).

Deploy the shared MCP first, then enable team vault sync, then optionally golden hosts and observability.

## What teams need

| Capability        | Why                                                                   | Start here                                                                                                                           |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Shared memory** | Same `Memory/` notes for every agent and engineer via `memory_recall` | [Team vault sync](#team-vault-sync)                                                                                                  |
| **Managed hosts** | Packer golden VMs + Pulumi that pull the team bucket at boot          | [Golden host images](#golden-host-images)                                                                                            |
| **Metrics**       | Throughput, errors, audit counters on `/metrics`                      | [IDP trace & metrics guide](https://docs.clawql.com/learn/audit-tool-and-observability)                                              |
| **Audit logs**    | Structured MCP tool events for grep and dashboards                    | [Audit tool & observability](https://docs.clawql.com/learn/audit-tool-and-observability)                                             |
| **Traces**        | Request latency across tools and mesh hops                            | OTEL → Tempo (lab) or your collector                                                                                                 |
| **Work traces**   | Token savings, eval scores, LLM spans                                 | Langfuse ([ADR 0005](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0005-langfuse-default-work-trace-store.md)) |

## Architecture

```text
Teammates / agents                Shared backend
─────────────────                 ──────────────
Cursor / Claude Desktop    ──►    clawql-mcp-http (Helm)
clawql sync pull/push      ◄──►   Object storage bucket
Golden hosts (boot pull)   ◄──►   Memory/ + sources/ (synced)
                                  Vault KV → ESO → pod env
                                  Prometheus / Loki / Tempo / Langfuse
```

Secrets (`vault/providers.json`, API tokens) stay local or in Vault — the sync bucket holds `Memory/` Markdown only. `memory.db` is rebuilt per pod after pull; the Markdown is the shared source of truth.

---

## Deploy the shared MCP backend

### Helm (recommended for teams)

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  --set envFromSecret=clawql-provider-env \
  --wait
```

Wire provider keys through HashiCorp Vault → External Secrets → `envFromSecret`. See [Vault provider secrets](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/deployment/vault-provider-secrets.md) and the [Operations guide](https://docs.clawql.com/deployment/operations-guide).

**Local lab:** `make local-k8s-up` on Docker Desktop — MCP at `http://clawql-mcp.localhost/mcp`, bundled Vault, Kyverno, ingress.

### Solo dev with team bucket

Engineers can run `npx clawql-mcp` locally and use `clawql sync pull` before `memory_recall` and `clawql sync push` after `memory_ingest` — same bucket as the cluster. Details under [Team vault sync](#team-vault-sync).

---

## Team vault sync

Share `~/.ClawQL` memory notes across your team via a centralized object-storage bucket. Cloudflare R2 is the default provider because Cloudflare is in the bundled default stack.

Ontology entity definitions and static knowledge belong in Git (small, PR-reviewed). Dynamic `Memory/` instances and generated indexes belong in the bucket (unbounded growth, not tracked in GitHub). See [Enterprise Ontology — Git vs R2](https://docs.clawql.com/architecture/enterprise-ontology#git-vs-r2--what-lives-where) and [ADR 0009](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0009-enterprise-ontology.md).

### What syncs

| Path                        | Shared                                        |
| --------------------------- | --------------------------------------------- |
| `Memory/`                   | Yes — team Markdown notes for `memory_recall` |
| `sources/` + `sources.json` | Yes — custom integrations                     |
| `Dashboard/chats/`          | Yes — optional agent chat threads             |
| `pageindex.db.json`         | Yes — PageIndex trees                         |
| `vault/providers.json`      | Never — API secrets stay local                |
| `memory.db`                 | No — rebuilt locally after pull               |

### Quick start (R2)

1. Create an R2 bucket in Cloudflare (e.g. `acme-clawql-team`).
2. Create R2 S3 API credentials (Manage R2 API tokens → Create API token with Object Read & Write).
3. Configure sync:

```bash
clawql sync init --interactive
# provider: r2 (default)
# bucket: acme-clawql-team
# prefix: teams/engineering/

export CLAWQL_R2_ACCOUNT_ID="<cloudflare-account-id>"
export CLAWQL_SYNC_ACCESS_KEY_ID="<r2-access-key>"
export CLAWQL_SYNC_SECRET_ACCESS_KEY="<r2-secret>"
```

Or store credentials in the local vault (loaded at MCP/CLI startup):

```bash
clawql secrets set r2AccessKeyId
clawql secrets set r2SecretAccessKey
clawql secrets set cloudflareAccountId
```

4. Push your notes:

```bash
clawql sync push
```

5. Teammates pull:

```bash
clawql sync init --bucket acme-clawql-team --prefix teams/engineering/
clawql sync pull
clawql doctor
```

### Quick start (S3)

1. Create an S3 bucket (e.g. `acme-clawql-team`) and an IAM user with `s3:GetObject`, `s3:PutObject`, `s3:ListBucket` on that bucket.
2. Configure sync:

```bash
clawql sync init --provider s3 --bucket acme-clawql-team --prefix teams/engineering/

export CLAWQL_AWS_ACCESS_KEY_ID="<iam-access-key>"
export CLAWQL_AWS_SECRET_ACCESS_KEY="<iam-secret>"
export CLAWQL_AWS_REGION="us-east-1"   # or CLAWQL_SYNC_REGION
```

Or store credentials in the local vault:

```bash
clawql secrets set awsAccessKeyId
clawql secrets set awsSecretAccessKey
```

3. Push and pull as with R2 (`clawql sync push`, `clawql sync pull`).

### Quick start (GCS)

Google Cloud Storage uses the S3-compatible interoperability API (HMAC keys), not the native GCS JSON API — same `@aws-sdk/client-s3` client as R2 and S3.

1. Create a GCS bucket (e.g. `acme-clawql-team`) in your GCP project.
2. Enable interoperability: Cloud Storage → Settings → Interoperability → Create a key for a service account (or user HMAC key).
3. Configure sync:

```bash
clawql sync init --provider gcs --bucket acme-clawql-team --prefix teams/engineering/
# interactive: provider accepts gcs or gcp

export CLAWQL_GCS_HMAC_ACCESS_ID="<hmac-access-id>"
export CLAWQL_GCS_HMAC_SECRET="<hmac-secret>"
# endpoint defaults to https://storage.googleapis.com (path-style)
```

Or store credentials in the local vault:

```bash
clawql secrets set gcsHmacAccessId
clawql secrets set gcsHmacSecret
```

4. Push your notes:

```bash
clawql sync push
```

5. Teammates pull:

```bash
clawql sync init --provider gcs --bucket acme-clawql-team --prefix teams/engineering/
clawql sync pull
clawql doctor
```

**Helm:** set `teamSync.provider: gcs` — the chart injects `CLAWQL_SYNC_ENDPOINT=https://storage.googleapis.com`. Put `gcsHmacAccessId` and `gcsHmacSecret` in the provider secret (via `envFromSecret`).

### Commands

| Command              | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `clawql sync init`   | Write `~/.ClawQL/sync.json` (no secrets)                               |
| `clawql sync push`   | Upload changed local files + update remote manifest                    |
| `clawql sync pull`   | Download changed remote files                                          |
| `clawql sync status` | Compare local vs remote (conflicts listed)                             |
| `--dry-run`          | Show plan without I/O                                                  |
| `--force`            | Overwrite on conflict (push → remote wins locally; pull → remote wins) |

### memory_sync (MCP tool)

Registered with `memory_ingest` / `memory_recall` (hide all with `CLAWQL_ENABLE_MEMORY=0`). Requires sync bucket + credentials. Use from Cursor Cloud Agents (including iOS) instead of shell `clawql sync`.

**Cursor iOS:** Cloud Agents have no local `~/.ClawQL` on the phone — configure dashboard Secrets, stdio MCP, and end-of-session `memory_sync`. Full walkthrough: [Agent setup — Cursor iOS](https://docs.clawql.com/agent-setup#cursor-ios-cloud-agent).

| Field       | Default | Meaning                                                                |
| ----------- | ------- | ---------------------------------------------------------------------- |
| `direction` | `auto`  | `auto`: pull remote, then push local. `pull` or `push`: one direction. |
| `force`     | `false` | Overwrite on conflicts; otherwise listed in response only.             |
| `dryRun`    | `false` | Plan without object storage I/O.                                       |

```json
{ "direction": "auto" }
```

### Providers

| Provider         | `sync.json`         | Endpoint                                     | Credentials                                   |
| ---------------- | ------------------- | -------------------------------------------- | --------------------------------------------- |
| **r2** (default) | `"provider": "r2"`  | `https://<account>.r2.cloudflarestorage.com` | R2 S3 API keys                                |
| **s3**           | `"provider": "s3"`  | AWS default                                  | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` |
| **gcs**          | `"provider": "gcs"` | `https://storage.googleapis.com`             | GCS HMAC interop keys                         |

### Environment

| Variable                        | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| `CLAWQL_SYNC_PROVIDER`          | `r2` (default), `s3`, or `gcs`             |
| `CLAWQL_SYNC_BUCKET`            | Bucket name (overrides sync.json)          |
| `CLAWQL_SYNC_PREFIX`            | Shared team prefix, e.g. `teams/acme/`     |
| `CLAWQL_SYNC_ACCESS_KEY_ID`     | R2 S3 API access key (or generic override) |
| `CLAWQL_SYNC_SECRET_ACCESS_KEY` | R2 S3 API secret (or generic override)     |
| `CLAWQL_R2_ACCOUNT_ID`          | Cloudflare account id (R2 endpoint)        |
| `CLAWQL_AWS_ACCESS_KEY_ID`      | S3 IAM access key                          |
| `CLAWQL_AWS_SECRET_ACCESS_KEY`  | S3 IAM secret                              |
| `CLAWQL_AWS_REGION`             | S3 region (e.g. `us-east-1`)               |
| `CLAWQL_GCS_HMAC_ACCESS_ID`     | GCS interoperability HMAC access id        |
| `CLAWQL_GCS_HMAC_SECRET`        | GCS interoperability HMAC secret           |
| `CLAWQL_SYNC_ENDPOINT`          | Override endpoint URL                      |
| `CLAWQL_SYNC_REGION`            | Region (`auto` for R2/GCS)                 |

Config file: `~/.ClawQL/sync.json` — safe to commit bucket/prefix in team docs; secrets should not go in this file.

### Auto sync (MCP runtime)

When the MCP server runs with sync configured, enable automatic background sync:

| Variable                           | Behavior                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `CLAWQL_SYNC_AUTO=1`               | Debounced push after each successful `memory_ingest` (default debounce **2s**) |
| `CLAWQL_SYNC_AUTO_DEBOUNCE_MS`     | Push debounce interval (default `2000`) — coalesces a short ingest burst; keep low so short-lived MCP/Cloud Agent processes still upload before exit |
| `CLAWQL_SYNC_AUTO_PULL=1`          | Throttled pull before `memory_recall` (default min interval 60s)            |
| `CLAWQL_SYNC_AUTO_PULL_MIN_MS`     | Min ms between auto-pulls (default `60000`)                                 |
| `CLAWQL_SYNC_AUTO_PULL_ON_START=1` | Pull once when MCP starts                                                   |

Auto sync logs to stderr (`[clawql-mcp] team sync auto-push/...`). Failures are non-fatal — ingest/recall still succeed.

Local dev example:

```bash
export CLAWQL_SYNC_AUTO=1
export CLAWQL_SYNC_AUTO_PULL=1
npx clawql-mcp-http
```

### Kubernetes: `teamSync` Helm values

```yaml
teamSync:
  enabled: true
  provider: r2 # r2 | s3 | gcs
  bucket: acme-clawql-team
  prefix: teams/engineering/
  autoPush: true
  autoPushDebounceMs: 30000
  autoPull: true
  autoPullMinMs: 60000
  autoPullOnStart: true
  r2:
    accountId: "<cloudflare-account-id>"
```

Credentials in Vault / `envFromSecret` (not in `values.yaml`):

| Provider         | Vault keys                                                                              |
| ---------------- | --------------------------------------------------------------------------------------- |
| **R2** (default) | `r2AccessKeyId`, `r2SecretAccessKey`, `cloudflareAccountId`                             |
| **S3**           | `awsAccessKeyId`, `awsSecretAccessKey` (+ `CLAWQL_AWS_REGION` via `extraEnv` if needed) |
| **GCS**          | `gcsHmacAccessId`, `gcsHmacSecret`                                                      |

**GCS example:**

```yaml
teamSync:
  enabled: true
  provider: gcs
  bucket: acme-clawql-team
  prefix: teams/production/
  autoPush: true
  autoPull: true
```

Store `gcsHmacAccessId` and `gcsHmacSecret` in the provider secret. The chart sets `CLAWQL_SYNC_ENDPOINT=https://storage.googleapis.com` automatically.

```bash
helm upgrade --install clawql ./charts/clawql-mcp \
  --set envFromSecret=clawql-provider-env \
  --set teamSync.enabled=true \
  --set teamSync.bucket=acme-clawql-team \
  --set teamSync.prefix=teams/engineering/ \
  --set teamSync.autoPush=true \
  --set teamSync.autoPull=true
```

Template smoke: `make helm-team-sync-template-tests`.

### After pull

Run `clawql doctor` or trigger `memory_recall` with `CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1` to refresh `memory.db` from new Markdown. When two teammates edit the same note, `sync status` lists conflicts; use `sync push --force` or `sync pull --force` deliberately.

---

## Golden host images

Provision ClawQL-ready servers with team agent context loaded at boot — for AWS, GCP, and Cloudflare managed offerings.

Pick providers and team bucket. ClawQL handles connection routing internally; you only need `search` and `execute` after boot.

Security constraints (credentials never baked; SHA-256 verify of pulled vault files; doctor gates at bake and boot) are documented in [Golden image pipeline — Packer VMs](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/golden-image-pipeline.md#packer-golden-host-vms-managed-tiers).

### What you get

| Component                   | Bake time (image)      | Boot time (runtime)                              |
| --------------------------- | ---------------------- | ------------------------------------------------ |
| ClawQL + Node 22            | Yes                    | —                                                |
| `~/.ClawQL` skeleton        | Yes                    | —                                                |
| `sync.json` (bucket/prefix) | Template only          | Overridden from metadata/env                     |
| Sync credentials            | Never baked            | Injected (Vault, instance role, secrets manager) |
| Team `Memory/` notes        | —                      | `clawql sync pull`                               |
| Health gate                 | `clawql doctor` (bake) | `clawql doctor --smoke` (boot)                   |

### Quick start (operators)

#### 1. Build or promote a golden image

```bash
cd packer
packer init .
packer build -only=aws-ami.amazon-ebs.clawql -var 'clawql_version=7.0.0' .
```

See [`packer/README.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/packer/README.md) for GCP and CI validate targets.

#### 2. Provision infrastructure (Pulumi)

Packer produces the artifact (AMI/GCP image). Pulumi provisions the VM, IAM, and boot user-data that references your tier sync prefix.

```bash
cd infra/pulumi
npm ci
pulumi stack init dev
pulumi config set clawql:cloud aws
pulumi config set clawql:tier dedicated
pulumi config set clawql:tenantId acme
pulumi config set clawql:syncBucket acme-clawql-team
pulumi config set clawql:goldenImageId ami-xxxxxxxx   # Packer output
pulumi preview   # or pulumi up — requires cloud credentials
```

See [`infra/pulumi/README.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/infra/pulumi/README.md) and [ADR 0007](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0007-pulumi-provisioning-managed-tiers.md). State lives on self-hosted R2 or S3.

#### 3. Launch with boot-time seeding

Set instance user-data / startup script to run:

```bash
export CLAWQL_SYNC_BUCKET=acme-clawql-team
export CLAWQL_SYNC_PREFIX=teams/production/
export CLAWQL_R2_ACCOUNT_ID=...
export CLAWQL_SYNC_ACCESS_KEY_ID=...
export CLAWQL_SYNC_SECRET_ACCESS_KEY=...
/usr/local/bin/bootstrap-team-vault.sh   # installed on golden images at bake time
```

Or use the repo script path: `scripts/packer/bootstrap-team-vault.sh`.

#### 4. Verify

```bash
clawql doctor --smoke
clawql sync status
```

### Tier seeding

| Tier           | Configuration                                        |
| -------------- | ---------------------------------------------------- |
| **Shared**     | `CLAWQL_SYNC_PREFIX=shared/`                         |
| **Dedicated**  | `CLAWQL_SYNC_PREFIX=tenant/<tenant-id>/`             |
| **Enterprise** | Customer-owned bucket; same image, their credentials |

### Cloudflare managed tier

Workers and containers do not use AMIs. Run `scripts/packer/cloudflare-bootstrap.sh` on first invocation — same pull + verify + doctor gate against verified R2 state.

### Kubernetes parity

In-cluster MCP uses Helm `teamSync` (`autoPullOnStart`, `autoPull`) — same semantics as golden-host boot. See [Team vault sync](#team-vault-sync) above.

### CI and releases

- **PR / main:** `scripts/packer/test-golden-host-scripts.sh` (ShellCheck + `packer validate`)
- **PR / main:** `scripts/pulumi/test-provision-unit.sh` (tier/user-data unit tests + TS build)
- **Release:** [`.github/workflows/packer-publish.yml`](https://docs.clawql.com/.github/workflows/packer-publish.yml) — matrix AWS/GCP on dispatch; docker validate on every run

---

## Observability for team MCP

Operators need three signal types plus optional LLM work traces.

### Metrics (Prometheus)

ClawQL exposes OpenMetrics at `GET /metrics` when `CLAWQL_ENABLE_HTTP_METRICS=1` (default on HTTP transport).

**Helm — scrape annotations** (default, works with Istio sample Prometheus):

```yaml
metrics:
  prometheusScrapeAnnotations:
    enabled: true
    path: /metrics
```

**Helm — ServiceMonitor** (kube-prometheus-stack):

```yaml
metrics:
  serviceMonitor:
    enabled: true
    labels:
      release: kube-prometheus-stack
```

Key series today: `clawql_audit_*`, `clawql_native_protocol_*`. Import dashboards from [`docs/grafana/`](https://docs.clawql.com/learn/audit-tool-and-observability).

**Verify:**

```bash
kubectl -n clawql port-forward svc/clawql-mcp-http 8080:8080
curl -s localhost:8080/metrics | head
```

### Audit → Loki

The MCP `audit` tool appends structured events. Push to Loki for team grep and Grafana panels:

```bash
CLAWQL_LOKI_PUSH_URL=http://loki:3100/loki/api/v1/push
```

See [Audit tool & observability](https://docs.clawql.com/learn/audit-tool-and-observability) and [Bring your own observability](https://docs.clawql.com/learn/audit-tool-and-observability).

### Infra traces (OTLP → Tempo)

```bash
CLAWQL_ENABLE_OTEL_TRACING=1
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=clawql-mcp
```

**Lab stack:** [Docker Desktop observability](https://docs.clawql.com/docker-desktop-observability) — Prometheus, Loki, Tempo, Grafana, OTEL collector in one profile.

### Work traces (Langfuse)

Langfuse is the default work-trace ledger for token savings and eval — opt out with `CLAWQL_ENABLE_LANGFUSE=0`. See [ADR 0005](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0005-langfuse-default-work-trace-store.md) and [Bundled observability](https://docs.clawql.com/docker-desktop-observability).

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` via Vault / `envFromSecret`.

### Observability profiles

| Profile    | Use case                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `bundled`  | Tier 1 Compose lab — Prometheus, Loki, Tempo, Grafana, Langfuse                                           |
| `external` | Point at existing backends — [bring-your-own](https://docs.clawql.com/learn/audit-tool-and-observability) |
| `minimal`  | Metrics only; disable Langfuse and optional push                                                          |

Index: [Observability bundle](https://docs.clawql.com/docker-desktop-observability).

---

## Verify end-to-end

Run this checklist after Helm install + team sync + observability wiring:

```bash
# Health
kubectl -n clawql get pods
curl -s http://clawql-mcp.localhost/healthz

# Metrics
curl -s http://clawql-mcp.localhost/metrics | grep clawql_audit

# Team memory (from a machine with sync configured)
clawql sync status
clawql doctor

# MCP memory round-trip
# memory_ingest a test note → auto-push (if CLAWQL_SYNC_AUTO=1)
# Teammate: clawql sync pull → memory_recall with the new note
```

**Grafana:** import [`clawql-core-observability.json`](https://docs.clawql.com/grafana/clawql-core-observability.json) and [`clawql-idp-observability.json`](https://docs.clawql.com/grafana/clawql-idp-observability.json).

After pull, run `clawql doctor` or set `CLAWQL_MEMORY_DB_SYNC_ON_RECALL=1` so `memory.db` reflects new Markdown.

---

## Next steps

- [Agent setup](https://docs.clawql.com/agent-setup) — desktop, Cursor iOS Cloud Agents, local sandbox
- [Local provider vault](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/local-provider-vault.md) — `~/.ClawQL` layout and secrets
- [Deployment & Operations guide](https://docs.clawql.com/deployment/operations-guide) — upgrades, secrets, day-2
- [Helm chart](https://docs.clawql.com/helm) — full `values.yaml` reference
- [Memory / Obsidian](https://docs.clawql.com/learn/memory) — `memory_ingest` / `memory_recall`
- [Golden image pipeline](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/security/golden-image-pipeline.md) — container + Packer VM security gates
- [ADR 0006](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0006-golden-host-images-packer.md) · [ADR 0007](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/adr/0007-pulumi-provisioning-managed-tiers.md)

© Copyright 2026. All rights reserved. · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL)
