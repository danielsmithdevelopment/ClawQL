# ClawQL 7.0 setup guide

**Audience:** operators and developers upgrading to **clawql-mcp 7.0.0** — npm, Docker, and Helm.

**Related:** [Migration guide](https://docs.clawql.com/resources/migration) · [local provider vault](./local-provider-vault.md) · [Vault provider secrets (Kubernetes)](../deployment/vault-provider-secrets.md) · [Operator Helm](../deployment/clawql-operator-helm.md)

---

## What changed in 7.0

| Area                       | 6.4.x and earlier                 | 7.0.0                                                                          |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| **Default provider merge** | Often implied **`all-providers`** | **Opinionated default stack:** Cloudflare, GitHub, Slack, Linear, Notion, Onyx |
| **Helm `provider` value**  | **`all-providers`**               | **`default`** (same as npm)                                                    |
| **Provider secrets**       | Mixed `.env` / ad-hoc Secrets     | **Vault-backed by default** (`secretSourcing.requireVaultBackedSecrets: true`) |
| **Legacy env names**       | Some `API_BASE_URL` aliases       | **`CLAWQL_*` only**                                                            |
| **Onboarding**             | Manual MCP JSON                   | **`clawql onboard`** / **`clawql init`** + local vault                         |

---

## Quick start (npm / stdio)

```bash
npx -p clawql-mcp clawql onboard --interactive
npx -p clawql-mcp clawql doctor --smoke
```

This scaffolds **`~/.ClawQL`**, prompts for default-stack tokens (hidden input), writes **`vault/providers.json`**, and can merge MCP config into Cursor or Claude Desktop.

**Full vendor merge (explicit opt-in):**

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
```

---

## Kubernetes / Helm

### 1. Provider merge

Chart default is now **`provider: default`** — npm parity. For full IDP labs:

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql \
  --set provider=all-providers
```

Or use **`charts/clawql-idp/values-idp-full.yaml`** for the umbrella chart.

### 2. Vault-backed secrets (required by default)

Production values require a Kubernetes Secret reference synced from HashiCorp Vault:

```yaml
envFromSecret: clawql-provider-env
secretSourcing:
  requireVaultBackedSecrets: true # default — set false only for lab overlays
```

Before first pod schedule:

1. Install bundled Vault or point External Secrets at your cluster Vault.
2. Populate KV path **`secret/clawql/providers`** (see [vault-provider-secrets.md](../deployment/vault-provider-secrets.md)).
3. Run **`make bootstrap-vault-eso`** on local stacks, or apply your ESO **`ExternalSecret`**.
4. Until sync succeeds, create a minimal placeholder **`Secret`** named **`clawql-provider-env`** so the Deployment can schedule.

**Lab opt-out (not for production):**

```yaml
secretSourcing:
  requireVaultBackedSecrets: false
```

You must then supply tokens via **`extraEnv`** or another supported pattern — plaintext cluster Secrets are discouraged.

### 3. Default-stack vault keys

When documents are **off** (`enableDocuments: false` or operator **`documents.enabled: false`**), populate at minimum:

| Vault property       | Env key                       |
| -------------------- | ----------------------------- |
| `githubToken`        | `CLAWQL_GITHUB_TOKEN`         |
| `slackToken`         | `CLAWQL_SLACK_TOKEN`          |
| `linearApiKey`       | `LINEAR_API_KEY`              |
| `notionApiToken`     | `NOTION_API_TOKEN`            |
| `onyxApiToken`       | `ONYX_API_TOKEN`              |
| `cloudflareApiToken` | `CLAWQL_CLOUDFLARE_API_TOKEN` |

When **documents / IDP** are on, also set Paperless, Stirling, Docling, and Nextcloud keys — see the full catalog in [vault-provider-secrets.md](../deployment/vault-provider-secrets.md).

### 4. ClawQL Operator (optional)

Install the operator scaffold and a **`ClawQLInstance`**:

```bash
helm upgrade --install clawql-operator ./charts/clawql-operator -n clawql-system --create-namespace
kubectl apply -f examples/operator/clawqlinstance-minimal.yaml -n clawql
clawql operator status
```

The operator publishes tier-spec + **`authExpectations.json`** to a ConfigMap and sets **`ProviderSecretsReady`** on the instance status:

- **`documents.enabled: false`** → reconcile **default-stack** keys only
- **`documents.enabled: true`** → reconcile default stack **plus all IDP vault keys**

Point **`spec.mcp.providerSecretName`** at your synced Secret if not using **`clawql-provider-env`**.

---

## Removed aliases (update your env)

| Removed                        | Use instead              |
| ------------------------------ | ------------------------ |
| `API_BASE_URL`                 | `CLAWQL_API_BASE_URL`    |
| `OPENAPI_SPEC_URL`             | `CLAWQL_SPEC_URL`        |
| `GOOGLE_DISCOVERY_URL`         | `CLAWQL_DISCOVERY_URL`   |
| `CLAWQL_PROVIDER=google-top50` | `CLAWQL_PROVIDER=google` |

---

## Upgrade checklist

1. Read [migration](https://docs.clawql.com/resources/migration) if you relied on implicit **`all-providers`**.
2. Replace legacy env aliases in `.env`, Helm values, and CI secrets.
3. Wire Vault → **`clawql-provider-env`** (or opt out explicitly for labs only).
4. Run **`clawql onboard`** or populate Vault KV for default-stack keys.
5. **`helm upgrade`** with **`provider: default`** or **`all-providers`** as needed.
6. Verify **`clawql doctor --smoke`** (local) or **`/healthz`** + **`search`** (cluster).
7. If using the operator: confirm **`ProviderSecretsReady=True`** on your **`ClawQLInstance`**.

---

## Local Kubernetes (`make local-k8s-up`)

The docker-desktop overlay now uses **`provider: default`** like npm. For a full IDP lab on Desktop:

```bash
make local-k8s-up HELM_EXTRA_SET='--set provider=all-providers'
```

Vault posture remains **`requireVaultBackedSecrets: true`** — run **`make bootstrap-vault-eso`** and import provider keys before expecting Ready pods.
