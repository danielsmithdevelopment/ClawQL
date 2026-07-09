## clawql-mcp 7.0.0

**npm:** pending tag — see [CHANGELOG.md#700---2026-07-09](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#700---2026-07-09)  
**Full changelog:** [CHANGELOG.md#700---2026-07-09](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#700---2026-07-09)  
**Target release:** 2026-07-09

---

## Headline

**One default everywhere, vault-first defense in depth.** Fresh `npx clawql-mcp` and Helm **`provider: default`** load the same opinionated stack (Cloudflare, GitHub, Slack, Linear, Notion, Onyx). Vault-backed provider secrets are required by default; the operator reconciles expected keys against your synced Secret.

---

## Default bundled stack (breaking)

| Before (≤6.4.x)                      | After (7.0.0)                    |
| ------------------------------------ | -------------------------------- |
| npm: no env → growing implicit merge | **Default stack** (6 vendors)    |
| Helm: **`all-providers`**            | Helm: **`default`** (npm parity) |

**Restore full merge:**

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
# Helm:
helm upgrade --install clawql ./charts/clawql-mcp --set provider=all-providers
```

→ [Migration guide](https://docs.clawql.com/resources/migration) · [7.0 setup guide](docs/getting-started/clawql-7-setup-guide.md)

---

## Vault required by default

- **`secretSourcing.requireVaultBackedSecrets: true`** (default) — render fails without **`envFromSecret`** / **`envFromSecrets`**
- Populate **`secret/clawql/providers`** in HashiCorp Vault; sync to **`clawql-provider-env`**
- Set **`requireVaultBackedSecrets: false`** only in explicit lab overlays

→ [vault-provider-secrets.md](docs/deployment/vault-provider-secrets.md)

---

## Legacy aliases removed

| Removed                | Replacement              |
| ---------------------- | ------------------------ |
| `API_BASE_URL`         | `CLAWQL_API_BASE_URL`    |
| `OPENAPI_SPEC_URL`     | `CLAWQL_SPEC_URL`        |
| `GOOGLE_DISCOVERY_URL` | `CLAWQL_DISCOVERY_URL`   |
| `google-top50` preset  | `CLAWQL_PROVIDER=google` |

---

## ClawQL Desktop (macOS, Windows, Linux)

Downloadable app wrapping the dashboard — **Provider secrets** + **Agent Chat** locally (no Kubernetes required for solo dev).

```bash
cd desktop && npm install && npm run dist:mac    # macOS .dmg
npm run dist:win                                 # Windows NSIS
npm run dist:linux                               # AppImage + deb
# or: make desktop-dist-mac | desktop-dist-win | desktop-dist-linux
```

Requires **OpenClaw** on `PATH` for chat. Secrets save to `~/.ClawQL/vault/providers.json` (same as `clawql init`).

→ [Desktop design doc](docs/design/clawql-desktop-macos.md) · [desktop/README.md](desktop/README.md)

---

## Custom sources + harness wrappers (Executor parity)

| Feature                                                 | Command                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Add OpenAPI / Discovery / GraphQL / gRPC / MCP from URL | `clawql sources add <url>`                                             |
| MCP-as-source / CLI-as-source                           | `clawql sources add --kind mcp …` / `--kind cli --command …`           |
| One-line install                                        | `curl -fsSL https://clawql.com/install \| bash`                        |
| Launch harness with ClawQL MCP                          | `clawql claude` · `clawql codex` · `clawql cursor` · `clawql opencode` |

Custom sources persist in **`~/.ClawQL/sources.json`** and merge into **`search`** / **`execute`** (with GraphQL projection still available for OpenAPI-backed ops).

→ [custom-sources.md](docs/getting-started/custom-sources.md)

---

## Onboarding CLI (Tier 1 + Tier 2)

| Command                                           | Purpose                                       |
| ------------------------------------------------- | --------------------------------------------- |
| `clawql onboard --interactive`                    | End-to-end init + MCP config + doctor smoke   |
| `clawql init --interactive`                       | Scaffold `~/.ClawQL` + `vault/providers.json` |
| `clawql secrets list` / `secrets set`             | Manage provider keys                          |
| `clawql sources list` / `sources add`             | Custom integrations from URL                  |
| `clawql doctor --smoke`                           | MCP `tools/list` + `search`                   |
| `clawql mcp-config --write cursor`                | Merge MCP JSON into Cursor / Claude Desktop   |
| `clawql claude` / `codex` / `cursor` / `opencode` | Harness launch with MCP pre-wired             |
| `clawql operator status`                          | Kubernetes: ClawQLInstance + tier-spec health |

---

## ClawQL Operator — auth reconciliation

- **`ProviderSecretsReady`** condition on **`ClawQLInstance`**
- **`authExpectations.json`** in tier-spec ConfigMap lists required vault keys
- **`documents.enabled: false`** → default-stack keys only
- **`documents.enabled: true`** → default stack + all IDP vault keys (Paperless, Stirling, Docling, Nextcloud, …)

→ [clawql-operator-helm.md](docs/deployment/clawql-operator-helm.md)

---

## IDP wave (shipped in 7.0)

Docling, LangExtract, IDP pipeline runner, NATS/KEDA worker, Langfuse→Ouroboros, lending Compose stack, dashboard Vault UI — see CHANGELOG **[7.0.0]** Added section.

---

## Helm charts

| Chart                    | Chart.version | appVersion |
| ------------------------ | ------------- | ---------- |
| `charts/clawql-mcp`      | `0.7.0`       | `7.0.0`    |
| `charts/clawql-operator` | `0.2.0`       | `7.0.0`    |

---

## Upgrade checklist

1. [Migration](https://docs.clawql.com/resources/migration) + [7.0 setup guide](docs/getting-started/clawql-7-setup-guide.md)
2. Replace legacy env aliases
3. Wire Vault → **`clawql-provider-env`**
4. `clawql onboard --interactive` or import provider KV
5. `helm upgrade` — choose **`default`** or **`all-providers`**
6. Operator: confirm **`ProviderSecretsReady=True`**

---

## Install

```bash
npm install clawql-mcp@7.0.0
npx clawql onboard --interactive
npx clawql-mcp-http

docker pull ghcr.io/danielsmithdevelopment/clawql-mcp:latest
```
