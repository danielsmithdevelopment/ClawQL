# Deploy ClawQL on Cloud Run (2-service)

This deploy pattern runs ClawQL as two Cloud Run services:

- `clawql-mcp-http` (remote MCP endpoint at `/mcp`)
- `clawql-graphql` (GraphQL proxy used by `execute` in single-spec mode)

Both services use the same container image; they differ by command/env.

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
PROJECT_ID="your-project-id" REGION="us-central1" make deploy-cloud-run
```

Optional inputs:

- `REPO` (default: `clawql`)
- `IMAGE` (default: `clawql-mcp`)
- `TAG` (default: current git short SHA, fallback `manual`)
- `PROVIDER` (default: `google-top50`)
- `MCP_SERVICE` (default: `clawql-mcp-http`)
- `GRAPHQL_SERVICE` (default: `clawql-graphql`)
- `ALLOW_UNAUTH` (`true` or `false`, default: `true`)

Optional **MCP-only** environment variables (exported before running the script; appended to the MCP Cloud Run service only):

| Variable | Enables | Notes |
|----------|---------|--------|
| `CLAWQL_OBSIDIAN_VAULT_PATH` | `memory_ingest` / `memory_recall` | Default in the image is `/vault` (writable). On Cloud Run this is **ephemeral** unless you attach a [volume](https://cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts) (GCS bucket, NFS, etc.). Omit or unset for search/execute-only. |
| `CLAWQL_SANDBOX_BRIDGE_URL` | `sandbox_exec` | HTTPS origin of your [sandbox bridge Worker](../cloudflare/sandbox-bridge/README.md). |
| `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` | `sandbox_exec` | Same value as the Worker `BRIDGE_SECRET`. **Do not commit**; for production prefer [Secret Manager](#secrets-for-sandbox-token) instead of plain `export`. |

Example (local shell, not for CI logs):

```bash
export CLAWQL_SANDBOX_BRIDGE_URL="https://clawql-sandbox-bridge.example.workers.dev"
export CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN="$(cat ~/.config/clawql/sandbox-token)"
PROJECT_ID="your-project-id" REGION="us-central1" bash scripts/deploy-cloud-run.sh
```

## What the script deploys

1. Creates Artifact Registry repo (idempotent).
2. Builds and pushes image via Cloud Build.
3. Deploys `clawql-graphql`:
   - command: `node`
   - args: `dist/graphql-proxy.js`
   - port `4000`
4. Reads GraphQL service URL.
5. Deploys `clawql-mcp-http`:
   - default command from image (`dist/server-http.js`)
   - port `8080`
   - env `GRAPHQL_URL=<graphql-service-url>/graphql`
6. Prints final MCP endpoint.

## Result

- MCP endpoint URL:
  - `https://<mcp-service-url>/mcp`
- Health:
  - `https://<mcp-service-url>/healthz`

## Notes

- For private deployments, set `ALLOW_UNAUTH=false`.
- Current sizing defaults in script:
  - MCP: `2 vCPU`, `2Gi`, `min-instances=1`
  - GraphQL: `1 vCPU`, `1Gi`, `min-instances=0`
- Tune provider scope (`PROVIDER`) for latency/cost.
- **Optional tools** (`sandbox_exec`, `memory_*`) work the same as locally: configure env on the **MCP** service only. The GraphQL service does not need vault or sandbox variables.
- With **no** optional env vars set, behavior matches a **search + execute** deployment (image defaults still set `CLAWQL_OBSIDIAN_VAULT_PATH=/vault` in the container; memory tools write under `/vault` on ephemeral instance storage unless you add a durable volume).

### Secrets (sandbox token)

Avoid passing `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` on the command line in CI. Create a secret and attach it to the MCP service:

```bash
# One-time: store the bridge shared secret
echo -n 'your-bridge-secret' | gcloud secrets create clawql-sandbox-token \
  --data-file=- --replication-policy=automatic

gcloud run services update clawql-mcp-http \
  --region "${REGION}" \
  --set-secrets="CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN=clawql-sandbox-token:latest"
```

You still need `CLAWQL_SANDBOX_BRIDGE_URL` set (via `gcloud run services update --set-env-vars` or the deploy script with `export` for non-secret values).
