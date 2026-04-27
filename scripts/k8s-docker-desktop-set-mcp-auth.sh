#!/usr/bin/env bash
# Create/update Kubernetes Secret **clawql-github-auth** with MCP upstream tokens (GitHub PAT +
# optional Cloudflare + Google), wire them into clawql-mcp-http, set CORS, and restart.
#
# Name: "mcp auth" — not GitHub-only; local k8s default bundle is all-providers (Google top50 +
# Cloudflare + GitHub + Slack + Paperless + Stirling + Tika + Gotenberg — see src/auth-headers.ts).
#
# Keys stored (when set):
#   CLAWQL_GITHUB_TOKEN, CLAWQL_BEARER_TOKEN  — required PAT (from gh, env, or stdin)
#   CLAWQL_CLOUDFLARE_API_TOKEN               — optional; Cloudflare execute
#   GOOGLE_ACCESS_TOKEN                       — optional; Google Discovery execute
#   CLAWQL_SLACK_TOKEN                        — optional; notify + Slack execute
#   ONYX_BASE_URL, ONYX_API_TOKEN             — optional; knowledge_search_onyx + Onyx execute
#   CLAWQL_ONYX_API_TOKEN                     — optional fallback for Onyx auth
#   PAPERLESS_API_TOKEN                       — optional; Paperless execute
#   STIRLING_API_KEY                          — optional; Stirling execute
#   CLAWQL_PROVIDER_AUTH_JSON                 — optional; unified per-provider auth map
#
# Secret name remains clawql-github-auth for backward compatibility with existing clusters.
#
# Prerequisites:
#   - Docker Desktop Kubernetes; context docker-desktop (or docker-for-desktop)
#   - Namespace clawql (e.g. make local-k8s-up)
#   - GitHub: gh auth login, or CLAWQL_GITHUB_TOKEN, or pipe a PAT to stdin
#
# Usage:
#   bash scripts/k8s-docker-desktop-set-mcp-auth.sh
#     (sources repo .env when present — use CLAWQL_LOAD_DOTENV=0 to skip)
#   gh auth token | bash scripts/k8s-docker-desktop-set-mcp-auth.sh
#   CLAWQL_GITHUB_TOKEN=ghp_xxx bash scripts/k8s-docker-desktop-set-mcp-auth.sh
#   CLAWQL_CLOUDFLARE_API_TOKEN=… CLAWQL_GOOGLE_ACCESS_TOKEN="$(gcloud auth print-access-token)" bash scripts/k8s-docker-desktop-set-mcp-auth.sh
#   CLAWQL_LOAD_DOTENV=0 bash scripts/k8s-docker-desktop-set-mcp-auth.sh   # do not source .env
#
# CORS (CLAWQL_CORS_ALLOW_ORIGIN on clawql-mcp-http — see server-http.ts):
#   Default: *  (Gallery / iPhone webview, Cloudflare Tunnel, etc.)
#   Override: CLAWQL_CORS_ALLOW_ORIGIN=https://your.app
#   Opt out:  CLAWQL_SKIP_CORS=1  (removes CLAWQL_CORS_ALLOW_ORIGIN from the deployment)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Optional: load repo `.env` so CLAWQL_CLOUDFLARE_API_TOKEN / CLAWQL_GITHUB_TOKEN / etc. match local dev.
# Disable with CLAWQL_LOAD_DOTENV=0. Skip if you rely on stdin for the GitHub token (pipe still works).
if [[ "${CLAWQL_LOAD_DOTENV:-1}" == "1" ]] && [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

SECRET_NAME="${SECRET_NAME:-clawql-github-auth}"
NAMESPACE="${NAMESPACE:-clawql}"
# Backward compat: DEPLOY was the MCP deployment name only.
DEPLOY_MCP="${DEPLOY_MCP:-${DEPLOY:-clawql-mcp-http}}"

KUBECTL_FLAG=()
if kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-desktop'; then
  KUBECTL_FLAG=(--context docker-desktop)
elif kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-for-desktop'; then
  KUBECTL_FLAG=(--context docker-for-desktop)
fi

kc() {
  kubectl "${KUBECTL_FLAG[@]}" "$@"
}

if ! kc get ns "$NAMESPACE" >/dev/null 2>&1; then
  echo "ERROR: namespace $NAMESPACE not found. Run: make local-k8s-up"
  exit 1
fi

TOKEN="${CLAWQL_GITHUB_TOKEN:-${CLAWQL_BEARER_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  if [[ -t 0 ]]; then
    if ! command -v gh >/dev/null 2>&1; then
      echo "ERROR: No CLAWQL_GITHUB_TOKEN/CLAWQL_BEARER_TOKEN and gh not on PATH. Install gh or export a token."
      exit 1
    fi
    TOKEN="$(gh auth token)"
  else
    TOKEN=""
    IFS= read -r TOKEN || true
  fi
fi

if [[ -z "${TOKEN// }" ]]; then
  echo "ERROR: empty GitHub token"
  exit 1
fi

CF_TOKEN="${CLAWQL_CLOUDFLARE_API_TOKEN:-}"
GOOGLE_TOKEN="${CLAWQL_GOOGLE_ACCESS_TOKEN:-${GOOGLE_ACCESS_TOKEN:-}}"
SLACK_TOKEN="${CLAWQL_SLACK_TOKEN:-${SLACK_BOT_TOKEN:-${SLACK_TOKEN:-${CLAWQL_SLACK_BOT_TOKEN:-}}}}"
ONYX_BASE_URL_VALUE="${ONYX_BASE_URL:-}"
ONYX_TOKEN="${ONYX_API_TOKEN:-${CLAWQL_ONYX_API_TOKEN:-}}"
ONYX_TOKEN_FALLBACK="${CLAWQL_ONYX_API_TOKEN:-}"
PAPERLESS_TOKEN="${PAPERLESS_API_TOKEN:-}"
STIRLING_KEY="${STIRLING_API_KEY:-}"
PROVIDER_AUTH_JSON="${CLAWQL_PROVIDER_AUTH_JSON:-}"

echo "==> Creating/updating secret $SECRET_NAME in namespace $NAMESPACE"
# Same PAT as CLAWQL_BEARER_TOKEN so mergedAuthHeaders() fallback works for github under merged loads.
SECRET_ARGS=( -n "$NAMESPACE" create secret generic "$SECRET_NAME"
  --from-literal=CLAWQL_GITHUB_TOKEN="$TOKEN"
  --from-literal=CLAWQL_BEARER_TOKEN="$TOKEN" )
if [[ -n "${CF_TOKEN// }" ]]; then
  SECRET_ARGS+=( --from-literal=CLAWQL_CLOUDFLARE_API_TOKEN="$CF_TOKEN" )
fi
if [[ -n "${GOOGLE_TOKEN// }" ]]; then
  SECRET_ARGS+=( --from-literal=GOOGLE_ACCESS_TOKEN="$GOOGLE_TOKEN" )
fi
if [[ -n "${SLACK_TOKEN// }" ]]; then
  SECRET_ARGS+=( --from-literal=CLAWQL_SLACK_TOKEN="$SLACK_TOKEN" )
fi
if [[ -n "${ONYX_BASE_URL_VALUE// }" ]]; then
  SECRET_ARGS+=( --from-literal=ONYX_BASE_URL="$ONYX_BASE_URL_VALUE" )
fi
if [[ -n "${ONYX_TOKEN// }" ]]; then
  SECRET_ARGS+=( --from-literal=ONYX_API_TOKEN="$ONYX_TOKEN" )
fi
if [[ -n "${ONYX_TOKEN_FALLBACK// }" ]]; then
  SECRET_ARGS+=( --from-literal=CLAWQL_ONYX_API_TOKEN="$ONYX_TOKEN_FALLBACK" )
fi
if [[ -n "${PAPERLESS_TOKEN// }" ]]; then
  SECRET_ARGS+=( --from-literal=PAPERLESS_API_TOKEN="$PAPERLESS_TOKEN" )
fi
if [[ -n "${STIRLING_KEY// }" ]]; then
  SECRET_ARGS+=( --from-literal=STIRLING_API_KEY="$STIRLING_KEY" )
fi
if [[ -n "${PROVIDER_AUTH_JSON// }" ]]; then
  SECRET_ARGS+=( --from-literal=CLAWQL_PROVIDER_AUTH_JSON="$PROVIDER_AUTH_JSON" )
fi
SECRET_ARGS+=( --dry-run=client -o yaml )
kc "${SECRET_ARGS[@]}" | kc apply -f -

ENV_KEYS="CLAWQL_GITHUB_TOKEN,CLAWQL_BEARER_TOKEN"
if [[ -n "${CF_TOKEN// }" ]]; then
  ENV_KEYS="${ENV_KEYS},CLAWQL_CLOUDFLARE_API_TOKEN"
fi
if [[ -n "${GOOGLE_TOKEN// }" ]]; then
  ENV_KEYS="${ENV_KEYS},GOOGLE_ACCESS_TOKEN"
fi
if [[ -n "${SLACK_TOKEN// }" ]]; then
  ENV_KEYS="${ENV_KEYS},CLAWQL_SLACK_TOKEN"
fi
if [[ -n "${ONYX_BASE_URL_VALUE// }" ]]; then
  ENV_KEYS="${ENV_KEYS},ONYX_BASE_URL"
fi
if [[ -n "${ONYX_TOKEN// }" ]]; then
  ENV_KEYS="${ENV_KEYS},ONYX_API_TOKEN"
fi
if [[ -n "${ONYX_TOKEN_FALLBACK// }" ]]; then
  ENV_KEYS="${ENV_KEYS},CLAWQL_ONYX_API_TOKEN"
fi
if [[ -n "${PAPERLESS_TOKEN// }" ]]; then
  ENV_KEYS="${ENV_KEYS},PAPERLESS_API_TOKEN"
fi
if [[ -n "${STIRLING_KEY// }" ]]; then
  ENV_KEYS="${ENV_KEYS},STIRLING_API_KEY"
fi
if [[ -n "${PROVIDER_AUTH_JSON// }" ]]; then
  ENV_KEYS="${ENV_KEYS},CLAWQL_PROVIDER_AUTH_JSON"
fi

attach_secret_env() {
  local dep="$1"
  if ! kc -n "$NAMESPACE" get "deployment/$dep" >/dev/null 2>&1; then
    echo "WARN: deployment/$dep not found — skip env attach (install ClawQL k8s or check name)."
    return 0
  fi
  echo "==> Attaching secret env to deployment/$dep ($ENV_KEYS)"
  kc -n "$NAMESPACE" set env "deployment/$dep" \
    --from="secret/${SECRET_NAME}" \
    --keys="$ENV_KEYS" \
    --overwrite
}

attach_secret_env "$DEPLOY_MCP"

if [[ "${CLAWQL_SKIP_CORS:-}" == "1" ]]; then
  echo "==> Removing CLAWQL_CORS_ALLOW_ORIGIN from deployment/$DEPLOY_MCP (CLAWQL_SKIP_CORS=1)"
  kc -n "$NAMESPACE" set env "deployment/$DEPLOY_MCP" CLAWQL_CORS_ALLOW_ORIGIN- 2>/dev/null || true
else
  CORS_ORIGIN="${CLAWQL_CORS_ALLOW_ORIGIN:-*}"
  if kc -n "$NAMESPACE" get "deployment/$DEPLOY_MCP" >/dev/null 2>&1; then
    echo "==> Setting CLAWQL_CORS_ALLOW_ORIGIN=$CORS_ORIGIN on deployment/$DEPLOY_MCP"
    kc -n "$NAMESPACE" set env "deployment/$DEPLOY_MCP" \
      CLAWQL_CORS_ALLOW_ORIGIN="$CORS_ORIGIN" \
      --overwrite
  fi
fi

echo "==> Restarting deployment $DEPLOY_MCP"
if kc -n "$NAMESPACE" get "deployment/$DEPLOY_MCP" >/dev/null 2>&1; then
  kc -n "$NAMESPACE" rollout restart "deployment/$DEPLOY_MCP"
  kc -n "$NAMESPACE" rollout status "deployment/$DEPLOY_MCP" --timeout=300s
fi

echo ""
echo "Done. MCP: http://localhost:8080/mcp"
echo "Health:  curl -s http://localhost:8080/healthz"
echo "GraphQL: same pod — http://localhost:8080/graphql (in-process with MCP)."
