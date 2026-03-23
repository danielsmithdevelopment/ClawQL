# Reproduce provider token benchmarks

The **README → “Provider benchmark breakdown”** section points here.

## What it measures

| Phase | What | In `latest.json` / summary table | Raw excerpts in `latest.md` |
|-------|------|----------------------------------|-------------------------------|
| **1** | Full `JSON.stringify(openapi)` vs **top-5** `search` payload | ✅ token counts + char totals | **No** — payloads are huge |
| **2 — payloads** | **Full REST response JSON** vs **GraphQL response JSON** (same op + field selection) | ✅ token counts | ✅ **Side-by-side JSON** (fixtures by default) |
| **2 — docs (secondary)** | OpenAPI response **schema** vs **field-selection string** | ✅ under `phase2Documentation` | No |

**Default (no credentials):** Phase 2 uses **representative** request/response pairs in
[`response-examples/`](response-examples/) so you still see **real JSON shape** (full vs lean),
not field names alone.

**Optional live:** `BENCHMARK_LIVE=1` runs the same **REST** and **in-process GraphQL** calls as production; when **both** succeed, live JSON replaces fixtures for that provider.

## Prerequisites

- Repo checkout of ClawQL
- **Bundled provider specs** under `providers/` (default in git).
- For offline runs, the script sets `CLAWQL_BUNDLED_OFFLINE=1` if unset.

## Run (offline — fixtures + full benchmark)

```bash
npm install
npm run benchmark:tokens
```

Outputs:

- `docs/benchmarks/latest.json`
- `docs/benchmarks/latest.md` — Phase 2 side-by-side: **full REST JSON** vs **GraphQL JSON**

## Optional: live REST + GraphQL (`BENCHMARK_LIVE=1`)

**Google (GKE list clusters)**

```bash
export BENCHMARK_LIVE=1
export CLAWQL_PROVIDER=google
export BENCHMARK_GOOGLE_PARENT="projects/YOUR_PROJECT/locations/us-central1"
export GOOGLE_ACCESS_TOKEN="$(gcloud auth print-access-token)"
npm run benchmark:tokens
```

**Jira (get issue)**

```bash
export BENCHMARK_LIVE=1
export CLAWQL_PROVIDER=jira
export CLAWQL_API_BASE_URL="https://YOURSITE.atlassian.net"
export BENCHMARK_JIRA_ISSUE_KEY="PROJ-123"
export CLAWQL_HTTP_HEADERS='{"Authorization":"Basic ..."}'
npm run benchmark:tokens
```

**Cloudflare (list DNS records)**

```bash
export BENCHMARK_LIVE=1
export CLAWQL_PROVIDER=cloudflare
export CLAWQL_API_BASE_URL="https://api.cloudflare.com/client/v4"
export BENCHMARK_CLOUDFLARE_ZONE_ID="your_zone_id"
export CLAWQL_BEARER_TOKEN="your_cloudflare_api_token"
npm run benchmark:tokens
```

> **Note:** Full Cloudflare OpenAPI → GraphQL schema build can be slow or memory-heavy.

## CI / regression (optional)

Run `npm run benchmark:tokens` offline and compare `latest.json` to a golden file.
