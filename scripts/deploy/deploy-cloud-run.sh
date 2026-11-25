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
# Audit 7.50: default refuse unauthenticated Cloud Run + require in-process gateway auth.
ALLOW_UNAUTH="${ALLOW_UNAUTH:-false}"
CLAWQL_AUTH_MODE="${CLAWQL_AUTH_MODE:-apiKey}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: PROJECT_ID is required."
  echo "Example:"
  echo "  PROJECT_ID=my-proj REGION=us-central1 CLAWQL_API_KEY=… bash scripts/deploy/deploy-cloud-run.sh"
  exit 1
fi

if [[ "${ALLOW_UNAUTH}" == "true" ]]; then
  echo "ERROR: ALLOW_UNAUTH=true is refused by default (audit 7.50)."
  echo "  Cloud Run IAM --allow-unauthenticated exposes MCP publicly. Prefer Identity-Aware clients"
  echo "  and set ALLOW_UNAUTH=false (default). Override only for deliberate public demos."
  if [[ "${CLAWQL_ALLOW_PUBLIC_CLOUDRUN:-}" != "1" ]]; then
    exit 1
  fi
  echo "WARN: CLAWQL_ALLOW_PUBLIC_CLOUDRUN=1 — proceeding with --allow-unauthenticated"
fi

case "${CLAWQL_AUTH_MODE}" in
  apiKey|oidc) ;;
  *)
    echo "ERROR: CLAWQL_AUTH_MODE must be apiKey or oidc (got: ${CLAWQL_AUTH_MODE})"
    exit 1
    ;;
esac

if [[ "${CLAWQL_AUTH_MODE}" == "apiKey" && -z "${CLAWQL_API_KEY:-}" ]]; then
  echo "ERROR: CLAWQL_API_KEY is required when CLAWQL_AUTH_MODE=apiKey (audit 7.50)."
  echo "  Prefer Secret Manager: gcloud run deploy … --set-secrets=CLAWQL_API_KEY=…"
  exit 1
fi

if [[ "${CLAWQL_AUTH_MODE}" == "oidc" ]]; then
  if [[ -z "${CLAWQL_OIDC_ISSUER:-}" || -z "${CLAWQL_OIDC_AUDIENCE:-}" ]]; then
    echo "ERROR: CLAWQL_OIDC_ISSUER and CLAWQL_OIDC_AUDIENCE are required when CLAWQL_AUTH_MODE=oidc"
    exit 1
  fi
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
MCP_ENV_VARS="CLAWQL_PROVIDER=${PROVIDER},PORT=8080,MCP_PATH=/mcp,CLAWQL_BUNDLED_OFFLINE=1,CLAWQL_AUTH_MODE=${CLAWQL_AUTH_MODE}"
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
if [[ "${CLAWQL_AUTH_MODE}" == "oidc" ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_OIDC_ISSUER=${CLAWQL_OIDC_ISSUER},CLAWQL_OIDC_AUDIENCE=${CLAWQL_OIDC_AUDIENCE}"
fi
# Bridge URL implies sandbox_exec should be listed; skip if operator already set CLAWQL_ENABLE_SANDBOX (e.g. 0).
if [[ -n "${CLAWQL_SANDBOX_BRIDGE_URL:-}" ]] && [[ "${MCP_ENV_VARS}" != *CLAWQL_ENABLE_SANDBOX=* ]]; then
  MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_ENABLE_SANDBOX=1"
fi

DEPLOY_SECRET_ARGS=()
if [[ "${CLAWQL_AUTH_MODE}" == "apiKey" ]]; then
  if [[ -n "${CLAWQL_API_KEY_SECRET:-}" ]]; then
    DEPLOY_SECRET_ARGS+=(--set-secrets "CLAWQL_API_KEY=${CLAWQL_API_KEY_SECRET}")
  else
    # Inline env for bootstrap only — prefer CLAWQL_API_KEY_SECRET=name:version for production.
    MCP_ENV_VARS="${MCP_ENV_VARS},CLAWQL_API_KEY=${CLAWQL_API_KEY}"
  fi
fi

echo "==> Deploying MCP service: ${MCP_SERVICE}"
gcloud run deploy "${MCP_SERVICE}" \
  --image "${IMAGE_URI}" \
  --region "${REGION}" \
  --platform managed \
  "${AUTH_ARGS[@]}" \
  --set-env-vars "${MCP_ENV_VARS}" \
  "${DEPLOY_SECRET_ARGS[@]}" \
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
