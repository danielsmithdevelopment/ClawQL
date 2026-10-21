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

**Local stdio (solo dev):** **`clawql init`** writes the same KV property names to **`~/.ClawQL/vault/providers.json`**; MCP loads them at startup. See **[`local-provider-vault.md`](../getting-started/local-provider-vault.md)**.

---

## Vault Transit encrypt-at-rest (recommended for SecretStore)

When ClawQL persists secrets in a database or local store (SQLite `SecretStore`, inference credential rows, etc.), prefer **Vault Transit** so a stealer that dumps the store gets ciphertext only — the encryption key never leaves Vault. This is the same failure mode as the October 2026 LiteLLM `1.107.0` supply-chain payload (which queried plaintext credential tables).

**Precise claim once the checklist below is done:** a database dump yields only ciphertext that **cannot be moved between tenants** (derived-key context binds tenant ID + secret path).

```bash
# Enable Transit; derived=true is required for context binding:
vault secrets enable transit
vault write -f transit/keys/clawql-secrets derived=true

# ClawQL wraps any SecretStore backend when this is set:
export CLAWQL_VAULT_TRANSIT_KEY=clawql-secrets
export CLAWQL_VAULT_TRANSIT_MOUNT=transit          # optional
export CLAWQL_VAULT_TRANSIT_TENANT=acme           # fallback tenant (or CLAWQL_DEFAULT_ORG_ID)
export CLAWQL_VAULT_TRANSIT_CACHE_TTL_MS=30000    # brief in-memory decrypt cache; never disk
export VAULT_ADDR=https://vault.example:8200
export VAULT_TOKEN=…                              # prefer K8s/AppRole/JWT — short-lived
```

Library entry points (`clawql-auth`): `VaultTransitProvider`, `TransitEncryptedSecretStore`, `migratePlaintextSecretsEffect` / `scanPlaintextSecretsEffect` / `rewrapAllSecretsEffect`, `resolveSecretStore({ vaultTransit: true })`.

### Checklist before turning Transit on by default

1. **Context binding** — encrypt/decrypt/rewrap always send Transit `context` = base64(`v1\ntenant=…\npath=…`). Paths under `tenants/{id}/…` use `{id}` as tenant; otherwise `CLAWQL_VAULT_TRANSIT_TENANT`. A ciphertext copied to another tenant/path fails to decrypt.
2. **Migrate existing plaintext** — enabling Transit only protects new writes. Run `migratePlaintextSecretsEffect(store)`, then `scanPlaintextSecretsEffect(store)` until `plaintextPaths` is empty, then set `CLAWQL_VAULT_TRANSIT_REJECT_PLAINTEXT=1`.
3. **Backups** — DB dumps taken before migration still hold plaintext. Purge them **or** rotate every provider key that lived in that store.
4. **Fail closed** — when Vault is unreachable, ciphertext rows do **not** decrypt (inference fails). A short in-memory cache (`CLAWQL_VAULT_TRANSIT_CACHE_TTL_MS`, default 30s) rides out brief blips; plaintext is never written to disk. Decrypt failures emit `VAULT_TRANSIT_DECRYPT_FAILED`. **Vault is on the critical path for SecretStore-backed inference.**
5. **Rotation / rewrap** — on a schedule: `vault write -f transit/keys/clawql-secrets/rotate`, then `rewrapAllSecretsEffect(store)`, then raise `min_decryption_version` once rewrap is clean so old key versions can be retired.

### LiteLLM IoCs outside the repo

The ClawQL lockfiles do not pull `litellm`, but AgentDojo harnesses, `pipx` tools, and Python envs on the Mac mini / laptops have their own site-packages. Scan those hosts:

```bash
bash scripts/security/scan-litellm-ioc.sh
# optional: bash scripts/security/scan-litellm-ioc.sh /path/to/agentdojo/.venv/lib/python3.x/site-packages
```

Look for `cook.pth` / `cook.py`, `litellm-1.107.0*.dist-info`, and `/tmp/remote_code_loader.lock` / `/tmp/.pc_once_*`.

**KV vs Transit:** Helm + ESO still sync **KV** `secret/clawql/providers` into `clawql-provider-env` for process env. Transit protects **application SecretStore** values at rest. Use both: KV for injection, Transit for anything ClawQL writes to a DB.

## Vault KV shape

<<<<<<< HEAD
| Mount            | Path                  | Purpose                                              |
| ---------------- | --------------------- | ---------------------------------------------------- |
| `secret` (KV v2) | `clawql/providers`    | All bundled provider credentials (camelCase fields)  |
| `transit`        | `keys/clawql-secrets` | Encryption key for SecretStore ciphertext (optional) |
=======
| Mount            | Path               | Purpose                                             |
| ---------------- | ------------------ | --------------------------------------------------- |
| `secret` (KV v2) | `clawql/providers` | All bundled provider credentials (camelCase fields) |
| `transit`        | `keys/clawql-secrets` (`derived=true`) | Encryption key for SecretStore ciphertext + tenant/path context |
>>>>>>> 3c41478ac (feat(clawql-auth): Transit context binding, migrate/rewrap, fail-closed cache)

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
| `linearApiKey`          | `LINEAR_API_KEY`                 | `linear` provider                |
| `notionApiToken`        | `NOTION_API_TOKEN`               | `notion` provider                |
| `googleAccessToken`     | `CLAWQL_GOOGLE_ACCESS_TOKEN`     | Google Discovery presets         |
| `atlassianApiToken`     | `CLAWQL_ATLASSIAN_TOKEN`         | Jira/Bitbucket                   |
| `labelStudioApiToken`   | `CLAWQL_LABEL_STUDIO_API_TOKEN`  | HITL enqueue                     |
| `hitlWebhookToken`      | `CLAWQL_HITL_WEBHOOK_TOKEN`      | HITL webhook                     |
| `coneshareWebhookToken` | `CLAWQL_CONESHARE_WEBHOOK_TOKEN` | ConeShare webhook                |

Canonical list in chart **`values.yaml`** → **`secretSourcing.providerEnvMapping`** and **`scripts/kubernetes/provider-vault-key-catalog.ts`**.

---

## Helm defaults (7.0.x+)

| Value                                      | Default               | Meaning                                                                              |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------ |
| `envFromSecret`                            | `clawql-provider-env` | MCP + worker load all mapped keys                                                    |
| `secretSourcing.requireVaultBackedSecrets` | `true`                | Render fails without `envFromSecret` / `envFromSecrets`                              |
| `secretSourcing.externalSecrets.enabled`   | `false`               | Set `true` to render **ClusterSecretStore** + **ExternalSecret** (requires ESO CRDs) |

### Enable chart-managed ExternalSecret

```bash
helm upgrade --install clawql manifests/charts/clawql-mcp -n clawql \
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

## Dashboard UI ([#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242))

Non-technical operators can configure provider tokens in the bundled ClawQL dashboard:

1. Open **Provider secrets** in the left nav (local: `http://clawql.localhost` when the dashboard Ingress is enabled).
2. Paste API keys or an entire `.env` snippet — matching provider keys auto-fill.
3. Click **Save & apply** — the dashboard writes **`secret/clawql/providers`**, patches **`Secret/clawql-provider-env`**, and restarts **`clawql-mcp-http`**.

Helm wires the dashboard pod with `CLAWQL_DASHBOARD_VAULT_PATH=clawql/providers` and `dashboard.allowSync: true`. See [`dashboard/README.md`](../../apps/dashboard/README.md) and [`helm.md`](helm.md) § dashboard.
