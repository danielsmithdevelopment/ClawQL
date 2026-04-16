# Deploy ClawQL on Cloud Run (single service)

This deploy pattern runs ClawQL as **one** Cloud Run service (**`clawql-mcp-http`**): remote MCP at **`/mcp`**, in-process GraphQL at **`/graphql`** on the same URL.

## Prerequisites

- `gcloud` authenticated with deploy permissions
- Cloud Build + Artifact Registry + Cloud Run APIs enabled
- Dockerfile already present at `docker/Dockerfile`

## One-shot script

Use the provided script from repo root:

```bash
PROJECT_ID="your-project-id" \
REGION="us-central1" \
bash scripts/deploy-cloud-run.sh
```

Or use `make`:

```bash
PROJECT_ID="your-project-id" REGION=us-central1 make deploy-cloud-run
```

Optional inputs:

- `REPO` (default: `clawql`)
- `IMAGE` (default: `clawql-mcp`)
- `TAG` (default: current git short SHA, fallback `manual`)
- `PROVIDER` (default: `google-top50`)
- `MCP_SERVICE` (default: `clawql-mcp-http`)
- `ALLOW_UNAUTH` (`true` or `false`, default: `true`)

Optional **MCP** environment variables (exported before running the script):

| Variable                              | Enables                           | Notes                                                                                                                                                                                                                                                            |
| ------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAWQL_OBSIDIAN_VAULT_PATH`          | `memory_ingest` / `memory_recall` | Default in the image is `/vault` (writable). On Cloud Run this is **ephemeral** unless you attach a [volume](https://cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts) (GCS bucket, NFS, etc.). Omit or unset for search/execute-only. |
| `CLAWQL_SANDBOX_BRIDGE_URL`           | `sandbox_exec`                    | HTTPS origin of your [sandbox bridge Worker](../cloudflare/sandbox-bridge/README.md).                                                                                                                                                                            |
| `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` | `sandbox_exec`                    | Same value as the Worker `BRIDGE_SECRET`. **Do not commit**; for production prefer [Secret Manager](#secrets-for-sandbox-token) instead of plain `export`.                                                                                                       |

Example (local shell, not for CI logs):

```bash
export CLAWQL_SANDBOX_BRIDGE_URL="https://clawql-sandbox-bridge.example.workers.dev"
export CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN="$(cat ~/.config/clawql/sandbox-token)"
PROJECT_ID="your-project-id" REGION="us-central1" bash scripts/deploy-cloud-run.sh
```

## What the script deploys

1. Creates Artifact Registry repo (idempotent).
2. Builds and pushes image via Cloud Build.
3. Deploys **`clawql-mcp-http`** (`dist/server-http.js`, port **8080**).
4. Prints MCP base URL, **`/mcp`**, **`/healthz`**, and **`/graphql`**.

## Result

- MCP endpoint: `https://<mcp-service-url>/mcp`
- GraphQL (same host): `https://<mcp-service-url>/graphql`
- Health: `https://<mcp-service-url>/healthz`

## Notes

- For private deployments, set `ALLOW_UNAUTH=false`.
- Default sizing: `2 vCPU`, `2Gi`, `min-instances=1` on the MCP service.
- Tune provider scope (`PROVIDER`) for latency/cost.
- **Optional tools** (`sandbox_exec`, `memory_*`) use env on the same service.
- With **no** optional env vars set, behavior matches a **search + execute** deployment (image defaults may still set `CLAWQL_OBSIDIAN_VAULT_PATH=/vault` in the container).

### Secrets (sandbox token)

Use [Secret Manager](https://cloud.google.com/secret-manager/docs) for production tokens; wire them into the Cloud Run service as secret env vars rather than plain `export` in shell history.
