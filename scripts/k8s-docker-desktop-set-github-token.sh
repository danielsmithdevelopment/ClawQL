#!/usr/bin/env bash
# Create/update a Kubernetes Secret with CLAWQL_BEARER_TOKEN (from gh or stdin),
# wire it into clawql-mcp-http, and restart the deployment.
#
# Prerequisites:
#   - Docker Desktop Kubernetes running; context docker-desktop (or docker-for-desktop)
#   - Namespace clawql already applied (e.g. make local-k8s-up)
#   - gh logged in: gh auth login   (or pass token via stdin)
#
# Usage:
#   bash scripts/k8s-docker-desktop-set-github-token.sh
#   gh auth token | bash scripts/k8s-docker-desktop-set-github-token.sh
#   CLAWQL_BEARER_TOKEN=ghp_xxx bash scripts/k8s-docker-desktop-set-github-token.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SECRET_NAME="${SECRET_NAME:-clawql-github-auth}"
NAMESPACE="${NAMESPACE:-clawql}"
DEPLOY="${DEPLOY:-clawql-mcp-http}"

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

TOKEN="${CLAWQL_BEARER_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  if [[ -t 0 ]]; then
    if ! command -v gh >/dev/null 2>&1; then
      echo "ERROR: No CLAWQL_BEARER_TOKEN and gh not on PATH. Install gh or export CLAWQL_BEARER_TOKEN."
      exit 1
    fi
    TOKEN="$(gh auth token)"
  else
    TOKEN="$(cat)"
  fi
fi

if [[ -z "${TOKEN// }" ]]; then
  echo "ERROR: empty token"
  exit 1
fi

echo "==> Creating/updating secret $SECRET_NAME in namespace $NAMESPACE"
kc -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
  --from-literal=CLAWQL_BEARER_TOKEN="$TOKEN" \
  --dry-run=client -o yaml | kc apply -f -

echo "==> Attaching secret env to deployment/$DEPLOY (CLAWQL_BEARER_TOKEN)"
kc -n "$NAMESPACE" set env "deployment/$DEPLOY" \
  --from="secret/${SECRET_NAME}" \
  --keys=CLAWQL_BEARER_TOKEN \
  --overwrite

echo "==> Restarting deployment/$DEPLOY"
kc -n "$NAMESPACE" rollout restart "deployment/$DEPLOY"
kc -n "$NAMESPACE" rollout status "deployment/$DEPLOY" --timeout=300s

echo ""
echo "Done. MCP: http://localhost:8080/mcp"
echo "Health:  curl -s http://localhost:8080/healthz"
