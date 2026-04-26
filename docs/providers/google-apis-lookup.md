# Google APIs unified directory

Google publishes a single **Discovery Service** directory that lists **all** public Google APIs (not only GKE). ClawQL vendors a snapshot for offline lookup and scripting.

## Source of truth (live)

- **Directory list:** [https://www.googleapis.com/discovery/v1/apis](https://www.googleapis.com/discovery/v1/apis)  
  Same catalog described in Google’s [Discovery Service](https://developers.google.com/discovery) docs.

## Files in this repo

| File                                                                                        | Purpose                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`providers/google/discovery-directory.json`](../providers/google/discovery-directory.json) | Verbatim `discovery#directoryList` JSON from the URL above.                                                                                            |
| [`providers/google/google-apis-lookup.json`](../providers/google/google-apis-lookup.json)   | Slim index: `id`, `title`, `discoveryRestUrl`, `documentationLink`, `preferred`, etc.                                                                  |
| [`providers/google/google-top50-apis.json`](../providers/google/google-top50-apis.json)     | Curated **50** GCP APIs we pre-download and optionally pregenerate GraphQL for.                                                                        |
| [`providers/google/apis/`](../providers/google/apis/README.md)                              | On-disk `discovery.json` (+ `introspection.json` / `schema.graphql` when generation succeeds) per [top-20 README](../providers/google/apis/README.md). |

Merged **`CLAWQL_PROVIDER=google`** loads the **bundled Google Cloud** Discovery set from the on-disk manifest ([`providers/google/google-top50-apis.json`](../providers/google/google-top50-apis.json); filename is historical). There is **no** standalone `CLAWQL_PROVIDER` for a single Google file — use **`CLAWQL_SPEC_PATH`** (e.g. [`providers/google/discovery.json`](../providers/google/discovery.json) or `providers/google/apis/container-v1/discovery.json`), **`CLAWQL_DISCOVERY_URL`**, or the manifest-backed merge. The directory files are also a **catalog** to pick the right `CLAWQL_DISCOVERY_URL`. For **offline** use of popular services without fetching, prefer paths under **`providers/google/apis/<slug>/discovery.json`** (see top-20 list).

## Refresh

```bash
npm run fetch-google-discovery-directory
# or (also refreshes Jira/Cloudflare/google GKE pin)
npm run fetch-provider-specs
```

## Using a specific Google API with ClawQL

1. Open `google-apis-lookup.json` and find the API (e.g. `run:v2` for Cloud Run).
2. Copy its `discoveryRestUrl` into the environment:

```bash
export CLAWQL_DISCOVERY_URL="https://run.googleapis.com/\$discovery/rest?version=v2"
clawql-mcp
```

Unset `CLAWQL_PROVIDER` when you set `CLAWQL_DISCOVERY_URL` (provider is ignored if discovery URL is set — see [`providers/README.md`](../providers/README.md)).

## Pre-downloaded “top 50” GCP services

We **maintain** pinned Discovery docs (and GraphQL artifacts when Omnigraph succeeds) for 20 common APIs — IAM, Compute, Storage, GKE, Cloud Run, Pub/Sub, BigQuery, etc. Refresh:

```bash
npm run refresh-google-top50
```

Details: [`providers/google/apis/README.md`](../providers/google/apis/README.md).

## Optional: download _all_ Discovery documents locally

Not recommended for normal use (hundreds of MB). Cache goes to `providers/google/discovery-cache/` (gitignored).

```bash
npm run fetch-all-google-discovery-specs -- --limit=3 --dry-run
```

## Multi-service GCP workflow (example)

For an ordered **route map** across GKE, IAM, Compute (firewall/LB), Logging, Monitoring, DNS, Storage, and BigQuery — with **`operationId`** names and arguments — see [`../workflows/workflow-gcp-multi-service.md`](../workflows/workflow-gcp-multi-service.md).

## Why not one giant merged spec?

Each Discovery document defines one API surface. Concatenating all of them into a single OpenAPI would create **massive** payloads, **colliding** `operationId`s, and impractical GraphQL generation. The supported model is **one Discovery (or OpenAPI) document per ClawQL process**, selected via `CLAWQL_DISCOVERY_URL` / `CLAWQL_SPEC_PATH` / `CLAWQL_PROVIDER`.
