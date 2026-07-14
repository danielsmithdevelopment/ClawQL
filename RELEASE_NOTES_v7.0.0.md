## clawql-mcp 7.0.0

**npm:** [`clawql-mcp@7.0.0`](https://www.npmjs.com/package/clawql-mcp/v/7.0.0) on npmjs.com (workspace packages ship inside the tarball via **`bundledDependencies`** until separate **`clawql-*`** modules are linked for OIDC publish)  
**Full changelog:** [CHANGELOG.md#700---2026-07-10](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#700---2026-07-10)  
**Release date:** 2026-07-10

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

→ [Migration guide](https://docs.clawql.com/resources/migration)

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

## Env flag conventions (breaking)

All feature toggles use **`CLAWQL_ENABLE_*`**: unset = default for that flag; **`=0`** opt-out; **`=1`** opt-in when default-off.

| Removed / old                     | Replacement                                |
| --------------------------------- | ------------------------------------------ |
| **`CLAWQL_DISABLE_HTTP_METRICS`** | **`CLAWQL_ENABLE_HTTP_METRICS=0`**         |
| (implicit Loki push when URL set) | **`CLAWQL_ENABLE_LOKI_PUSH=0`** to opt out |

→ [`.env.example`](.env.example) · [configuration.md](docs/readme/configuration.md)

---

## npm distribution (7.0.0)

**`clawql-mcp@7.0.0`** is on npm. Install with `npm install clawql-mcp@7.0.0` or `npx -p clawql-mcp@7.0.0 clawql-mcp`.

Split **`clawql-*`** workspace packages are **not** published as separate npm modules yet (OIDC trusted publishing requires each package to be linked on npmjs.com first). The release workflow falls back to **`bundledDependencies`** inside the **`clawql-mcp`** tarball — same install story as **6.4.x**, with all eleven horizontal packages vendored under `node_modules/clawql-mcp/node_modules/`.

| Package             | Role                                       |
| ------------------- | ------------------------------------------ |
| `clawql-core`       | Audit, cache, Merkle, plugin types         |
| `clawql-auth`       | Gateway auth + upstream credential headers |
| `clawql-pageindex`  | Vectorless hierarchical indexing           |
| `clawql-api`        | Spec load, search/execute, Presidio hooks  |
| `clawql-memory`     | Vault I/O, embeddings, ingest/recall       |
| `clawql-documents`  | IDP pipeline, classify/extract             |
| `clawql-automation` | Schedule, notify, Argo workflow/argocd     |
| `clawql-sandbox`    | `sandbox_exec`                             |
| `clawql-ouroboros`  | Evolutionary loop tools                    |
| `clawql-operator`   | K8s operator library                       |
| `clawql-release`    | Layer 0 manifest MVP                       |
| `clawql-mcp`        | MCP transport (bundles workspace packages) |

Publish order (when split packages go live): [`scripts/release/npm-publish-order.json`](scripts/release/npm-publish-order.json). Smoke: [`scripts/dev/test-npm-pack-install.sh`](scripts/dev/test-npm-pack-install.sh).

---

## Observability ADR 0005

Accepted architecture for **Langfuse as default work-trace store** with profile-based deployment ([#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)):

| Profile        | Use case                      | Langfuse emission                                     |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| **`bundled`**  | Tier 1 Compose, local k8s lab | On by default (`CLAWQL_ENABLE_LANGFUSE=0` to opt out) |
| **`external`** | Production / existing stack   | On when `LANGFUSE_*` set; same opt-out                |
| **`minimal`**  | Metrics-only / strict policy  | Off                                                   |

**7.0.0 ships ADR + docs + env catalog** — runtime profile wiring is Phase 1 of [`7.0-observability-profiles-plan.md`](docs/observability/7.0-observability-profiles-plan.md). Existing signals unchanged: **`GET /metrics`** on by default; OTLP and Loki push remain opt-in via their env vars.

→ [ADR 0005](docs/adr/0005-langfuse-default-work-trace-store.md) · [bundled observability](docs/observability/bundled-observability.md) · [BYO observability](docs/observability/bring-your-own-observability.md)

---

## ClawQL Desktop (macOS, Windows, Linux)

Downloadable app wrapping the dashboard — **Provider secrets** + **Agent Chat** + **Custom sources** locally (no Kubernetes required for solo dev).

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

| Command                                           | Purpose                                                                     |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `clawql onboard --interactive`                    | End-to-end init + MCP config + doctor smoke                                 |
| `clawql init --interactive`                       | Scaffold `~/.ClawQL` + `vault/providers.json`                               |
| `clawql secrets list` / `secrets set`             | Manage provider keys                                                        |
| `clawql sources list` / `sources add`             | Custom integrations from URL                                                |
| `clawql doctor --smoke`                           | Release manifest verify (when bundle present) + MCP `tools/list` + `search` |
| `clawql mcp-config --write cursor`                | Merge MCP JSON into Cursor / Claude Desktop                                 |
| `clawql release publish`                          | Immutable manifest (Layer 0 MVP)                                            |
| `clawql claude` / `codex` / `cursor` / `opencode` | Harness launch with MCP pre-wired                                           |
| `clawql operator status`                          | Kubernetes: ClawQLInstance + tier-spec health                               |

---

## ClawQL Operator — auth reconciliation

- **`ProviderSecretsReady`** condition on **`ClawQLInstance`**
- **`authExpectations.json`** in tier-spec ConfigMap lists required vault keys
- **`documents.enabled: false`** → default-stack keys only
- **`documents.enabled: true`** → default stack + all IDP vault keys (Paperless, Stirling, Docling, Nextcloud, …)

→ [clawql-operator-helm.md](docs/deployment/clawql-operator-helm.md)

---

## Layer 0 — release manifest at runtime

- **`clawql release init|collect|manifest|publish|verify`** — manifest **v0.1** with git commit, npm tarball + CycloneDX SBOM SHA-256, GHCR image digests, Merkle root
- **`clawql doctor --smoke`** verifies `releases/v{version}/manifest.json` when the bundle exists
- **`CLAWQL_RELEASE_MANIFEST`** — optional MCP startup verify (strict when `NODE_ENV=production` or `CLAWQL_RELEASE_MANIFEST_STRICT=1`)

→ [clawql-release-mvp.md](docs/getting-started/clawql-release-mvp.md)

---

## Phase 1 exit (finalized 7.0.0)

- **`clawql-auth`** — `CLAWQL_AUTH_MODE=noAuth|apiKey`, `CLAWQL_API_KEY`, ATR-shaped claims on HTTP MCP
- **`clawql-pageindex`** — `pageindex_*` MCP tools (default on; `CLAWQL_ENABLE_PAGEINDEX=0` to hide)
- **Presidio** — `CLAWQL_ENABLE_PRESIDIO=1` + analyzer/anonymizer URLs; redacts execute, memory ingest, external ingest
- **Tier 1 Compose** — `examples/clawql-local-docker-compose` (`./bootstrap.sh`, `docker compose up`)

→ [modularization-implementation-status.md](docs/design/modularization-implementation-status.md)

---

## IDP wave (shipped in 7.0)

Docling, LangExtract, IDP pipeline runner, NATS/KEDA worker, Langfuse→Ouroboros, lending Compose stack, dashboard Vault UI — see CHANGELOG **[7.0.0]** Added section.

---

## Docs site

- **`/vision/ecosystem`** — ecosystem overview synced from docs
- **`/getting-started/clawql-release-mvp`** — Layer 0 release manifest guide
- Shared doc link rewriter for generated MDX; consolidated nav via [`docs-nav-data.ts`](website/src/lib/docs-nav-data.ts)
- HITL: [`docs/mcp/hitl-label-studio.md`](docs/mcp/hitl-label-studio.md) is canonical; plugin index is a stub

---

## Helm charts

| Chart                    | Chart.version | appVersion |
| ------------------------ | ------------- | ---------- |
| `charts/clawql-mcp`      | `0.7.0`       | `7.0.0`    |
| `charts/clawql-operator` | `0.2.0`       | `7.0.0`    |
| `charts/clawql-idp`      | `0.1.0`       | `7.0.0`    |

---

## Upgrade checklist (6.4.x → 7.0.0)

1. [Migration guide](https://docs.clawql.com/resources/migration)
2. Replace legacy env aliases and **`CLAWQL_DISABLE_HTTP_METRICS`** → **`CLAWQL_ENABLE_HTTP_METRICS=0`**
3. Wire Vault → **`clawql-provider-env`**
4. `clawql onboard --interactive` or import provider KV
5. `helm upgrade` — choose **`default`** or **`all-providers`**
6. Operator: confirm **`ProviderSecretsReady=True`**
7. npm: **`clawql-mcp@7.0.0`** on npm (bundled workspace packages); separate **`clawql-*`** modules when registry linking is complete

---

## Install

```bash
curl -fsSL https://clawql.com/install | bash
# or:
npm install clawql-mcp@7.0.0
npx clawql onboard --interactive
npx clawql-mcp-http

docker pull ghcr.io/danielsmithdevelopment/clawql-mcp:latest
```

**Node:** `>=22` (see root `package.json` `engines`).
