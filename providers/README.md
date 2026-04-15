# Bundled providers

ClawQL ships **optional** on-disk copies of popular API descriptions so cold
start avoids downloading multi‑MB specs.

| `CLAWQL_PROVIDER` | Spec file | Notes |
|-------------------|-----------|--------|
| `google` | `google/discovery.json` | Single Google Discovery spec (GKE). For multi-service Google, use `CLAWQL_GOOGLE_TOP50_SPECS=1` or `CLAWQL_SPEC_PATHS`. |
| `atlassian` | `atlassian/jira/openapi.yaml` + `atlassian/bitbucket/openapi.yaml` | Loads both Atlassian specs in one merged operation index (multi-spec mode). |
| `cloudflare` | `cloudflare/openapi.yaml` | Official [Cloudflare API schemas](https://github.com/cloudflare/api-schemas) OpenAPI (large; ~tens of MB). |
| `github` | `github/openapi.yaml` | [github/rest-api-description](https://github.com/github/rest-api-description) `api.github.com` bundle (very large; thousands of operations). |
| `slack` | `slack/openapi.json` | Official Web API spec from [api.slack.com/specs](https://api.slack.com/specs) (OpenAPI 2; loader upgrades). |
| `sentry` | `sentry/openapi.json` | Dereferenced public API from [getsentry/sentry-api-schema](https://github.com/getsentry/sentry-api-schema) (`openapi-derefed.json`). |
| `n8n` | `n8n/openapi.json` | n8n Public API (bundled JSON; refresh via `npm run fetch-n8n-openapi` against a running instance). |
| `jira` | `atlassian/jira/openapi.yaml` | Jira Cloud REST (alias of single-spec mode; also part of `atlassian` / `all-providers`). |
| `bitbucket` | `atlassian/bitbucket/openapi.yaml` | Bitbucket Cloud REST (alias; also part of `atlassian` / `all-providers`). |
| `google-top50` | *(merged preset)* | Curated [`google-top50-apis.json`](google/google-top50-apis.json) only (~50 Discovery specs). |
| `default-multi-provider` | *(merged preset)* | Same as **no spec env**: GitHub + Cloudflare. |
| `all-providers` | *(merged preset)* | Top50 + **every** other `BUNDLED_PROVIDERS` vendor (adds Bitbucket, GitHub, Slack, Sentry, n8n, …). |

Compatibility aliases for merged groups: `atlassian` = Jira + Bitbucket together.

**Google API catalog (all services):** The repo includes a snapshot of Google’s public [Discovery directory](https://www.googleapis.com/discovery/v1/apis) as `google/discovery-directory.json` and a slim index `google/google-apis-lookup.json` (id → `discoveryRestUrl`, docs link, `preferred`). Refresh with `npm run fetch-google-discovery-directory` (also runs at the end of `npm run fetch-provider-specs`). Details: [`docs/google-apis-lookup.md`](../docs/google-apis-lookup.md).

**Google “top 50” offline bundle:** Pinned Discovery JSON (and optional `introspection.json` / `schema.graphql`) for common GCP services — under [`google/apis/`](google/apis/README.md). Manifest: `google/google-top50-apis.json`. Refresh: `npm run fetch-google-top50` then `npm run build && npm run pregenerate-google-top50-graphql`, or `npm run refresh-google-top50`.

**Default no-config mode:** when no spec env vars are set, ClawQL loads a bundled multi-provider set (**GitHub + Cloudflare**) so agents can **`search`** / **`execute`** both APIs in one process. Set **`CLAWQL_GITHUB_TOKEN`** and **`CLAWQL_CLOUDFLARE_API_TOKEN`** (or **`GITHUB_TOKEN`** / **`CLOUDFLARE_API_TOKEN`**) together for live calls — see `src/auth-headers.ts`.

**All-providers merged preset:** set **`CLAWQL_PROVIDER=all-providers`** to load **Google top50 + every other bundled vendor** (Jira, Bitbucket, Cloudflare, GitHub, Slack, Sentry, n8n) in one merged operation index. This wins over **`CLAWQL_GOOGLE_TOP50_SPECS`** when both are set. Adding a new entry under `BUNDLED_PROVIDERS` automatically includes it here.

**Precedence (multi-spec):** `CLAWQL_SPEC_PATHS` (explicit file list) → **`CLAWQL_PROVIDER`** when it names a **merged** preset (`google-top50`, `default-multi-provider`, `all-providers`, `atlassian`) → **`CLAWQL_GOOGLE_TOP50_SPECS=1`** (same as loading `google-top50` when provider is not a merged preset) → default bundle when nothing else is set.

**Precedence (single-spec):** `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL` / `CLAWQL_DISCOVERY_URL` override **`CLAWQL_PROVIDER`** for a **single** bundled id (`cloudflare`, `jira`, …).

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

## Pregenerate GraphQL artifacts

After specs exist and TypeScript is built, optional introspection + SDL for faster
MCP field resolution:

```bash
npm run build
npm run fetch-provider-specs
npm run pregenerate-graphql
```

**Requires [Bun](https://bun.sh)** for `pregenerate-graphql` (same script runs under Node
if you prefer; Bun is what maintainers test with).

Writes `introspection.json` and `schema.graphql` next to each bundled spec.
Large or imperfect specs (e.g. **Jira**) may fail **`@omnigraph/openapi`**; **Google GKE**
usually succeeds. The **full Cloudflare** OpenAPI from
[api-schemas](https://github.com/cloudflare/api-schemas) is very large and may
still hit **Omnigraph / json-machete** edge cases during pregenerate even after spec
normalization — that’s OK: `search` uses the full OpenAPI, and `execute` can use
**REST fallback** when GraphQL isn’t available. Upstream: [GraphQL Mesh](https://the-guild.dev/graphql/mesh/docs/handlers/openapi) / [`ardatan/graphql-mesh`](https://github.com/ardatan/graphql-mesh).

Override path explicitly:

- `CLAWQL_INTROSPECTION_PATH` — JSON from `introspectionFromSchema` (same shape as standard introspection query root).
