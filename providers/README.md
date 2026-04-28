# Bundled providers

ClawQL ships **optional** on-disk copies of popular API descriptions so cold
start avoids downloading multi‑MB specs. **Native GraphQL / gRPC** upstreams are usually configured with **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`** (see **`.env.example`** and **`docs/adr/0002-multi-protocol-supergraph.md`**). **Linear** is the exception: it is a **bundled GraphQL-only** provider (**`linear`** — SDL under **`providers/linear/`**, same merged presets as OpenAPI vendors).

| `CLAWQL_PROVIDER` | Spec file | Notes |
|-------------------|-----------|--------|
| `atlassian` | `atlassian/jira/openapi.yaml` + `atlassian/bitbucket/openapi.yaml` | Loads both Atlassian specs in one merged operation index (multi-spec mode). |
| `cloudflare` | `cloudflare/openapi.yaml` | Official [Cloudflare API schemas](https://github.com/cloudflare/api-schemas) OpenAPI (large; ~tens of MB). |
| `github` | `github/openapi.yaml` | [github/rest-api-description](https://github.com/github/rest-api-description) `api.github.com` bundle (very large; thousands of operations). |
| `slack` | `slack/openapi.json` | Official Web API spec from [api.slack.com/specs](https://api.slack.com/specs) (OpenAPI 2; loader upgrades). |
| `sentry` | `sentry/openapi.json` | Dereferenced public API from [getsentry/sentry-api-schema](https://github.com/getsentry/sentry-api-schema) (`openapi-derefed.json`). |
| `n8n` | `n8n/openapi.json` | n8n Public API (bundled JSON; refresh via `npm run fetch-n8n-openapi` against a running instance). |
| `linear` | `linear/schema.graphql` | **GraphQL only** (no REST OpenAPI). SDL from Linear’s MIT-licensed SDK repo; refresh via **`npm run fetch-linear-schema`**. Endpoint **`https://api.linear.app/graphql`**. Auth: **`LINEAR_API_KEY`** / **`CLAWQL_LINEAR_API_KEY`** → `Authorization` (raw key). See [`linear/README.md`](linear/README.md). |
| `tika` | `tika/openapi.yaml` | Apache Tika Server (minimal bundled paths; optional refresh from `TIKA_BASE_URL` when `/openapi.json` exists). Set **`TIKA_BASE_URL`** for merged `execute` base URL. |
| `gotenberg` | `gotenberg/openapi.yaml` | Gotenberg 8+ (minimal bundled paths; optional refresh from **`GOTENBERG_BASE_URL`**). Set **`GOTENBERG_BASE_URL`** for merged `execute` base URL. |
| `paperless` | `paperless/openapi.yaml` | Paperless-ngx REST (minimal subset; refresh from live **`PAPERLESS_BASE_URL`** via `npm run fetch-provider-specs`). Auth: **`PAPERLESS_API_TOKEN`** → `Authorization: Token …`. Onboarding: [`docs/providers/paperless-onboarding.md`](../docs/providers/paperless-onboarding.md). |
| `stirling` | `stirling/openapi.yaml` | Stirling-PDF (minimal stub; refresh from **`STIRLING_BASE_URL`** `/v3/api-docs`). Auth: **`STIRLING_API_KEY`** → `X-API-KEY`. |
| `onyx` | `onyx/openapi.yaml` | Onyx — minimal **`POST /search/send-search-message`** plus **`POST /onyx-api/ingestion`** (ingestion API for post-Paperless indexing; [#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)). Set **`ONYX_BASE_URL`** (API root; include `/api` if mounted there). Auth: **`ONYX_API_TOKEN`** or **`CLAWQL_ONYX_API_TOKEN`** → `Authorization: Bearer …`. Optional MCP tool **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`**. See [Onyx API](https://docs.onyx.app/). |
| `jira` | `atlassian/jira/openapi.yaml` | Jira Cloud REST (alias of single-spec mode; also part of `atlassian` / `all-providers`). |
| `bitbucket` | `atlassian/bitbucket/openapi.yaml` | Bitbucket Cloud REST (alias; also part of `atlassian` / `all-providers`). |
| `google` | *(merged preset)* | Bundled **Google Cloud** APIs from the on-disk manifest ([`google-top50-apis.json`](google/google-top50-apis.json); filename is historical). For the same merge without this preset, use **`CLAWQL_BUNDLED_PROVIDERS=google`**. Deprecated alias: **`google-top50`** → `google`. |
| `all-providers` | *(merged preset)* | Google Cloud (bundled) + **every** `BUNDLED_PROVIDERS` vendor. **Only built-in default** when no other merge is selected. |
| **`CLAWQL_BUNDLED_PROVIDERS=`** *ids…* | *(ad hoc merge)* | Comma/semicolon/newline-separated `BUNDLED_PROVIDERS` keys and/or **`google`**. The custom alternative to `all-providers` — there is no other “partial” default. |

Compatibility aliases for merged groups: `atlassian` = Jira + Bitbucket together; **`google-top50`** = **`google`** (deprecated).

**Google API catalog (all services):** The repo includes a snapshot of Google’s public [Discovery directory](https://www.googleapis.com/discovery/v1/apis) as `google/discovery-directory.json` and a slim index `google/google-apis-lookup.json` (id → `discoveryRestUrl`, docs link, `preferred`). Refresh with `npm run fetch-google-discovery-directory` (also runs at the end of `npm run fetch-provider-specs`). Details: [`docs/providers/google-apis-lookup.md`](../docs/providers/google-apis-lookup.md).

**Google “top 50” offline bundle:** Pinned Discovery JSON (and optional `introspection.json` / `schema.graphql`) for common GCP services — under [`google/apis/`](google/apis/README.md). Manifest: `google/google-top50-apis.json`. Refresh: `npm run fetch-google-top50` then `npm run build && npm run pregenerate-google-top50-graphql`, or `npm run refresh-google-top50`.

**Default no-config mode:** when no spec env vars are set, ClawQL loads **`all-providers`**. For live **`execute`** calls, set **`CLAWQL_PROVIDER_AUTH_JSON`** (one JSON object keyed by merged **`specLabel`**) and/or per-vendor env vars — see **`src/auth-headers.ts`** (e.g. **`CLAWQL_GOOGLE_ACCESS_TOKEN`**, **`CLAWQL_CLOUDFLARE_API_TOKEN`**, **`CLAWQL_GITHUB_TOKEN`**, **`PAPERLESS_API_TOKEN`**, **`STIRLING_API_KEY`**).

**All-providers** is the **sole** unconfigured default merge. **`CLAWQL_BUNDLED_PROVIDERS=…`** is the only way to pick a **named subset** without writing paths (or use **`CLAWQL_SPEC_PATHS`**) — there is no implicit “Google-only” or “default-multi” path anymore.

**Precedence (multi-spec):** `CLAWQL_SPEC_PATHS` (explicit file list) → **`CLAWQL_BUNDLED_PROVIDERS`** (id list) → **`CLAWQL_PROVIDER`** when it names a **merged** preset (`google`, `all-providers`, `atlassian`, …) → **`all-providers`** when nothing else is set.

**Precedence (single-spec):** `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL` / `CLAWQL_DISCOVERY_URL` override **`CLAWQL_PROVIDER`** for a **single** bundled id (`cloudflare`, `jira`, …). For **one** Google API file only, use **`CLAWQL_SPEC_PATH`** (e.g. `providers/google/apis/container-v1/discovery.json`) or **`CLAWQL_DISCOVERY_URL`** — there is no standalone **`CLAWQL_PROVIDER`** for Google beyond merged **`google`**.

**Local-first:** Bundled specs are read from disk first; the remote fallback URL is
only used if the file is missing **and** `CLAWQL_BUNDLED_OFFLINE` is not set (`1` /
`true` = never fetch; fail fast if the file is absent).

**Pregenerated GraphQL:** MCP loads `introspection.json` from disk at startup when
present (`CLAWQL_INTROSPECTION_PATH` or the bundled path for your provider). The
GraphQL proxy still builds executable resolvers from the same OpenAPI on startup
(there is no separate “skip build” path today).

## Refresh bundled files

From the repo root (needs network):

```bash
npm run fetch-provider-specs
```

**n8n** is not included in that script (the bundled spec is served inside Swagger UI, not as a static URL). With a running n8n instance and the public API enabled, run:

```bash
N8N_BASE_URL=http://127.0.0.1:5678 npm run fetch-n8n-openapi
```

**Paperless, Stirling, Tika, Gotenberg, Onyx:** `npm run fetch-provider-specs` also refreshes their specs **when** these env vars are set (see `.env.example`):

- **`PAPERLESS_BASE_URL`** — fetches `/api/schema/` into `providers/paperless/openapi.yaml`
- **`STIRLING_BASE_URL`** — fetches `/v3/api-docs` into `providers/stirling/openapi.yaml`
- **`TIKA_BASE_URL`** / **`GOTENBERG_BASE_URL`** — tries `/openapi.json` (or yaml/swagger) when the server exposes one; otherwise keeps the committed minimal spec
- **`ONYX_BASE_URL`** — tries `/openapi.json` then `/openapi.yaml` at the API root (optional **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** as Bearer) into `providers/onyx/openapi.yaml`. Upstream specs can be **very large**; trim or replace with a minimal subset before committing if build/CI regresses.

## Pregenerate GraphQL artifacts

After specs exist and TypeScript is built, optional introspection + SDL for faster
MCP field resolution:

```bash
npm run build
npm run fetch-provider-specs
npm run pregenerate-graphql
```

Writes `introspection.json` and `schema.graphql` next to each bundled spec.
Large or imperfect specs (e.g. **Jira**) may fail **`@omnigraph/openapi`**; **Google GKE**
usually succeeds. The **full Cloudflare** OpenAPI from
[api-schemas](https://github.com/cloudflare/api-schemas) is very large and may
still hit **Omnigraph / json-machete** edge cases during pregenerate even after spec
normalization — that’s OK: `search` uses the full OpenAPI, and `execute` can use
**REST fallback** when GraphQL isn’t available. Upstream: [GraphQL Mesh](https://the-guild.dev/graphql/mesh/docs/handlers/openapi) / [`ardatan/graphql-mesh`](https://github.com/ardatan/graphql-mesh).

Override path explicitly:

- `CLAWQL_INTROSPECTION_PATH` — JSON from `introspectionFromSchema` (same shape as standard introspection query root).
