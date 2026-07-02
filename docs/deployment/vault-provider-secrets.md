# Vault provider secrets (default path) ([#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241))

**HashiCorp Vault** is the canonical store for **bundled provider API keys** in production. Kubernetes **`Secret/clawql-provider-env`** is synced from Vault KV via **External Secrets Operator**; the Helm chart wires **`envFromSecret: clawql-provider-env`** into **`clawql-mcp-http`** (and the NATS worker when enabled).

**Related:** [External Secrets install](external-secrets-operator-install.md) · [Helm § secrets](helm.md) · [#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242) (Vault UI)

---

## Data flow

```text
.env (local) ──import──► Vault KV secret/clawql/providers
                              │
                              ▼ (ESO refreshInterval)
                         Secret/clawql-provider-env
                              │
                              ▼ envFrom
                         clawql-mcp-http  →  execute auth-headers
```

Do **not** put provider tokens in **`extraEnv`** or chart-managed **`documentPipeline`/`idpCollaboration` Secrets** for production — use Vault + ESO so rotation and audit stay centralized.

---

## Vault KV shape

| Mount            | Path               | Purpose                                             |
| ---------------- | ------------------ | --------------------------------------------------- |
| `secret` (KV v2) | `clawql/providers` | All bundled provider credentials (camelCase fields) |

### Field catalog

| Vault property          | Kubernetes Secret key (env var)  | Used by                          |
| ----------------------- | -------------------------------- | -------------------------------- |
| `githubToken`           | `CLAWQL_GITHUB_TOKEN`            | `github` provider                |
| `slackToken`            | `CLAWQL_SLACK_TOKEN`             | `slack` / `notify`               |
| `onyxApiToken`          | `ONYX_API_TOKEN`                 | `onyx` / `knowledge_search_onyx` |
| `paperlessApiToken`     | `PAPERLESS_API_TOKEN`            | IDP archive                      |
| `stirlingApiKey`        | `STIRLING_API_KEY`               | IDP redaction                    |
| `doclingApiKey`         | `DOCLING_API_KEY`                | IDP layout parse                 |
| `nextcloudUsername`     | `NEXTCLOUD_USERNAME`             | IDP intake/sync                  |
| `nextcloudAppPassword`  | `NEXTCLOUD_APP_PASSWORD`         | IDP intake/sync                  |
| `coneshareApiToken`     | `CONESHARE_API_TOKEN`            | VDR sharing                      |
| `cloudflareApiToken`    | `CLAWQL_CLOUDFLARE_API_TOKEN`    | `cloudflare` provider            |
| `googleAccessToken`     | `CLAWQL_GOOGLE_ACCESS_TOKEN`     | Google Discovery presets         |
| `atlassianApiToken`     | `CLAWQL_ATLASSIAN_TOKEN`         | Jira/Bitbucket                   |
| `labelStudioApiToken`   | `CLAWQL_LABEL_STUDIO_API_TOKEN`  | HITL enqueue                     |
| `hitlWebhookToken`      | `CLAWQL_HITL_WEBHOOK_TOKEN`      | HITL webhook                     |
| `coneshareWebhookToken` | `CLAWQL_CONESHARE_WEBHOOK_TOKEN` | ConeShare webhook                |

Canonical list in chart **`values.yaml`** → **`secretSourcing.providerEnvMapping`** and **`scripts/kubernetes/provider-vault-key-catalog.ts`**.

---

## Helm defaults (6.4.x+)

| Value                                      | Default               | Meaning                                                                              |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| `envFromSecret`                            | `clawql-provider-env` | MCP + worker load all mapped keys                                                    |
| `secretSourcing.requireVaultBackedSecrets` | `true`                | Render fails without `envFromSecret` / `envFromSecrets`                              |
| `secretSourcing.externalSecrets.enabled`   | `false`               | Set `true` to render **ClusterSecretStore** + **ExternalSecret** (requires ESO CRDs) |

### Enable chart-managed ExternalSecret

```bash
helm upgrade --install clawql charts/clawql-mcp -n clawql \
  --set secretSourcing.externalSecrets.enabled=true
```

`make bootstrap-vault-eso` applies the same templates after Vault policy/auth are configured (local Docker Desktop flow).

---

## Import from `.env`

```bash
IMPORT_MODE=providers VAULT_TOKEN=… npm run import-dotenv-to-vault -- --kubectl-exec
# or HTTP after port-forward:
IMPORT_MODE=providers IMPORT_USE_HTTP=1 VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=… \
  npm run import-dotenv-to-vault:http -- --mode providers
```

Only recognized provider keys are written (see catalog). Use **`--mode full`** for **`secret/clawql/dotenv`** (every `.env` key).

After rotation:

```bash
kubectl rollout restart deployment/clawql-mcp-http -n clawql
```

---

## Local bootstrap

```bash
make local-k8s-up
make bootstrap-vault-eso   # Vault + ESO + Helm ExternalSecret + placeholder KV
```

Replace placeholders with real tokens via **`import-dotenv-to-vault`** or **`vault kv patch`**.

---

## Out of scope ([#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242))

Operator UI for browsing/editing Vault paths — use Vault CLI, UI, or your GitOps pipeline for now.
