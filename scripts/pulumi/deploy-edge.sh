#!/usr/bin/env bash
# Configure + preview/up the Cloudflare edge Pulumi stack.
# Expects: ensure-r2-state-backend.sh already sourced (AWS_* + PULUMI_BACKEND_URL).
#
# Env:
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (required)
#   PULUMI_STACK (default: edge-prod)
#   PULUMI_ACTION (preview | up) default: preview
#   CLAWQL_DEPLOY_WORKER_STUB (true|false) default: true — deploys full gateway module
#   CLAWQL_SYNC_BUCKET (default: clawql-vault-prod)
#   CLAWQL_EDGE_NAME_PREFIX (default: clawql)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "::group::Build clawql-gateway Worker bundle"
(
  cd "${ROOT}/cloudflare/gateway"
  if [[ ! -d node_modules ]]; then
    npm install --legacy-peer-deps
  fi
  npm run build
)
echo "::endgroup::"

cd "${ROOT}/infra/pulumi"

STACK="${PULUMI_STACK:-edge-prod}"
ACTION="${PULUMI_ACTION:-preview}"
DEPLOY_STUB="${CLAWQL_DEPLOY_WORKER_STUB:-true}"
SYNC_BUCKET="${CLAWQL_SYNC_BUCKET:-clawql-vault-prod}"
EDGE_PREFIX="${CLAWQL_EDGE_NAME_PREFIX:-clawql}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-}}"

if [[ -z "${PULUMI_BACKEND_URL:-}" ]]; then
  echo "::error::PULUMI_BACKEND_URL unset — source scripts/pulumi/ensure-r2-state-backend.sh first" >&2
  exit 1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${ACCOUNT_ID}" ]]; then
  echo "::error::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required" >&2
  exit 1
fi

command -v pulumi >/dev/null || {
  echo "::error::pulumi CLI not installed" >&2
  exit 1
}

echo "::group::pulumi login (R2)"
pulumi logout || true
pulumi login "${PULUMI_BACKEND_URL}"
echo "::endgroup::"

echo "::group::stack select ${STACK}"
pulumi stack select "${STACK}" --create
echo "::endgroup::"

echo "::group::stack config"
pulumi config set clawql:cloud cloudflare
pulumi config set clawql:profile edge
pulumi config set clawql:tier shared
pulumi config set clawql:syncBucket "${SYNC_BUCKET}"
pulumi config set clawql:syncProvider r2
pulumi config set clawql:edgeNamePrefix "${EDGE_PREFIX}"
pulumi config set clawql:deployWorkerStub "${DEPLOY_STUB}"
pulumi config set cloudflare:accountId "${ACCOUNT_ID}"
pulumi config set cloudflare:apiToken "${CLOUDFLARE_API_TOKEN}" --secret
echo "::endgroup::"

case "${ACTION}" in
  preview)
    echo "::group::pulumi preview"
    pulumi preview --non-interactive --diff
    echo "::endgroup::"
    ;;
  up)
    echo "::group::pulumi up"
    pulumi up --yes --non-interactive
    echo "::endgroup::"
    echo "::group::stack outputs"
    pulumi stack output --json || true
    echo "::endgroup::"
    ;;
  *)
    echo "::error::Unknown PULUMI_ACTION=${ACTION} (expected preview|up)" >&2
    exit 1
    ;;
esac
