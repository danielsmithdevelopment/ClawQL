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
