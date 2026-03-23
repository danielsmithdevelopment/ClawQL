# Bundled providers

ClawQL ships **optional** on-disk copies of popular API descriptions so cold
start avoids downloading multi‑MB specs.

| `CLAWQL_PROVIDER` | Spec file | Notes |
|-------------------|-----------|--------|
| `atlassian` | `atlassian/jira/openapi.yaml` + `atlassian/bitbucket/openapi.yaml` | Loads both Atlassian specs in one merged operation index (multi-spec mode) |
| `jira` | `atlassian/jira/openapi.yaml` | Atlassian community Jira OpenAPI (YAML) |
| `bitbucket` | `atlassian/bitbucket/openapi.yaml` | Atlassian community Bitbucket OpenAPI (YAML) |
| `google` | `google/discovery.json` | Default: **GKE** only (`container.googleapis.com` v1). See **`google-apis-lookup.json`** for *all* Google APIs. |
| `google-top20` | `google/apis/<slug>/discovery.json` (20 files from manifest) | Loads curated Google top-20 services into one merged operation index (multi-spec mode) |
| `cloudflare` | `cloudflare/openapi.yaml` | Official [Cloudflare API schemas](https://github.com/cloudflare/api-schemas) OpenAPI (large; ~tens of MB) |

**Google API catalog (all services):** The repo includes a snapshot of Google’s public [Discovery directory](https://www.googleapis.com/discovery/v1/apis) as `google/discovery-directory.json` and a slim index `google/google-apis-lookup.json` (id → `discoveryRestUrl`, docs link, `preferred`). Refresh with `npm run fetch-google-discovery-directory` (also runs at the end of `npm run fetch-provider-specs`). Details: [`docs/google-apis-lookup.md`](../docs/google-apis-lookup.md).

**Google “top 20” offline bundle:** Pinned Discovery JSON (and optional `introspection.json` / `schema.graphql`) for IAM, Compute, Storage, GKE, Cloud Run, Pub/Sub, BigQuery, and 13 more — under [`google/apis/`](google/apis/README.md). Manifest: `google/google-top20-apis.json`. Refresh: `npm run fetch-google-top20` then `npm run build && npm run pregenerate-google-top20-graphql`, or `npm run refresh-google-top20`.

**Precedence:** `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL` / `CLAWQL_DISCOVERY_URL`
always override `CLAWQL_PROVIDER` (bring-your-own spec unchanged).

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
