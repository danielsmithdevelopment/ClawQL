#!/usr/bin/env bash
# Load repo `.env` into HashiCorp Vault KV (not a Kubernetes Secret). See import-dotenv-to-vault.ts header.
#
# Usage (from repo root):
#   export VAULT_TOKEN=…   # required
#   bash scripts/kubernetes/import-dotenv-to-vault.sh
#
# By default this passes --kubectl-exec (vault runs inside the Vault pod). For a local `vault` CLI
# against `VAULT_ADDR` (e.g. port-forward), set:  IMPORT_USE_VAULT_CLI=1
#
# Env:
#   KUBE_CONTEXT — optional; otherwise scripts/kubernetes/lib/select-local-k8s-context.sh
#   IMPORT_USE_HTTP=1 — use KV v2 HTTP API (--http); needs VAULT_ADDR + VAULT_TOKEN (no vault CLI / no kubectl exec)
#   IMPORT_USE_VAULT_CLI=1 — use VAULT_ADDR + vault on PATH instead of kubectl exec
#   IMPORT_MODE=providers — shorthand for --mode providers (clawql/providers ESO shape)
#   VAULT_POD — override pod name (default clawql-hashicorpvault-0)
#   NAMESPACE (default clawql)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

NAMESPACE="${NAMESPACE:-clawql}"
EXTRA=(--root "$ROOT" --namespace "$NAMESPACE")

if [[ "${IMPORT_USE_HTTP:-}" == "1" ]]; then
  EXTRA+=(--http)
elif [[ "${IMPORT_USE_VAULT_CLI:-}" == "1" ]]; then
  :
else
  EXTRA+=(--kubectl-exec)
fi

if [[ -n "${IMPORT_MODE:-}" ]]; then
  EXTRA+=(--mode "${IMPORT_MODE}")
fi
if [[ -n "${VAULT_POD:-}" ]]; then
  EXTRA+=(--vault-pod "${VAULT_POD}")
fi
if [[ -n "${KUBE_CONTEXT:-}" ]]; then
  EXTRA+=(--kube-context "$KUBE_CONTEXT")
fi
if [[ "${IMPORT_RESTART_MCP:-}" == "1" ]]; then
  EXTRA+=(--restart-deployment "${DEPLOY_MCP:-${DEPLOY:-clawql-mcp-http}}")
fi

TSX="${ROOT}/node_modules/.bin/tsx"
if [[ -x "$TSX" ]]; then
  exec "$TSX" "${ROOT}/scripts/kubernetes/import-dotenv-to-vault.ts" "${EXTRA[@]}"
fi
exec npx tsx "${ROOT}/scripts/kubernetes/import-dotenv-to-vault.ts" "${EXTRA[@]}"
