#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Deploy ClawQL as a single Cloud Run service (MCP Streamable HTTP + in-process GraphQL on /graphql).
#
# Optional MCP env (export before running; see docs/deployment/deploy-cloud-run.md):
#   CLAWQL_OBSIDIAN_VAULT_PATH   — memory_ingest / memory_recall (default in image: /vault)
#   CLAWQL_ENABLE_SANDBOX        — 1 / true / yes registers MCP sandbox_exec (default off — opt in)
#   CLAWQL_SANDBOX_BRIDGE_URL    — sandbox_exec bridge (Cloudflare Worker origin)
#   CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN — bridge shared secret (prefer Secret Manager in prod)

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-clawql}"
IMAGE="${IMAGE:-clawql-mcp}"
PROVIDER="${PROVIDER:-google}"
MCP_SERVICE="${MCP_SERVICE:-clawql-mcp-http}"
ALLOW_UNAUTH="${ALLOW_UNAUTH:-true}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: PROJECT_ID is required."
  echo "Example:"
  echo "  PROJECT_ID=my-proj REGION=us-central1 bash scripts/deploy/deploy-cloud-run.sh"
  exit 1
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  TAG="${TAG:-$(git rev-parse --short HEAD)}"
else
  TAG="${TAG:-manual}"
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:${TAG}"

if [[ "${ALLOW_UNAUTH}" == "true" ]]; then
  AUTH_ARGS=(--allow-unauthenticated)
else
  AUTH_ARGS=(--no-allow-unauthenticated)
fi

echo "==> Using project: ${PROJECT_ID}"
echo "==> Region: ${REGION}"
echo "==> Image: ${IMAGE_URI}"
echo "==> Provider: ${PROVIDER}"

gcloud config set project "${PROJECT_ID}"

# Ensure APIs are enabled.
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# Ensure Artifact Registry repo exists.
gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="ClawQL container images" >/dev/null 2>&1 || true

echo "==> Building image with Cloud Build..."
gcloud builds submit --tag "${IMAGE_URI}" .

# MCP env: base + optional vault / Cloudflare Sandbox bridge (memory_ingest / memory_recall / sandbox_exec).
# Prefer Secret Manager for CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN in production (see docs/deployment/deploy-cloud-run.md).
MCP_ENV_VARS="CLAWQL_PROVIDER=${PROVIDER},PORT=8080,MCP_PATH=/mcp,CLAWQL_BUNDLED_OFFLINE=1"
if [[ -n "${CLAWQL_OBSIDIAN_VAULT_PATH:-}" ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_OBSIDIAN_VAULT_PATH=${CLAWQL_OBSIDIAN_VAULT_PATH}"
fi
if [[ -n "${CLAWQL_ENABLE_SANDBOX:-}" ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_ENABLE_SANDBOX=${CLAWQL_ENABLE_SANDBOX}"
fi
if [[ -n "${CLAWQL_SANDBOX_BRIDGE_URL:-}" ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_SANDBOX_BRIDGE_URL=${CLAWQL_SANDBOX_BRIDGE_URL}"
fi
if [[ -n "${CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN:-}" ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN=${CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN}"
fi
# Bridge URL implies sandbox_exec should be listed; skip if operator already set CLAWQL_ENABLE_SANDBOX (e.g. 0).
if [[ -n "${CLAWQL_SANDBOX_BRIDGE_URL:-}" ]] && [[ "${MCP_ENV_VARS}" != *CLAWQL_ENABLE_SANDBOX=* ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_ENABLE_SANDBOX=1"
fi

echo "==> Deploying MCP service: ${MCP_SERVICE}"
gcloud run deploy "${MCP_SERVICE}" \
  --image "${IMAGE_URI}" \
  --region "${REGION}" \
  --platform managed \
  "${AUTH_ARGS[@]}" \
  --set-env-vars "${MCP_ENV_VARS}" \
  --port 8080 \
  --cpu 2 \
  --memory 2Gi \
  --concurrency 10 \
  --min-instances 1 \
  --max-instances 10

MCP_BASE_URL="$(gcloud run services describe "${MCP_SERVICE}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo
echo "Deploy complete."
echo "MCP health: ${MCP_BASE_URL}/healthz"
echo "MCP endpoint: ${MCP_BASE_URL}/mcp"
echo "GraphQL (same service): ${MCP_BASE_URL}/graphql"
