#!/usr/bin/env bash
set -euo pipefail

# Delete the MCP Deployment + Service in namespace clawql so Helm can install cleanly.
# Use after switching from kubectl apply / Kustomize to Helm, or when Helm reports
# "invalid ownership metadata" on helm upgrade --install.
#
# Does not delete the namespace or other workloads (e.g. graphql, Langfuse) in clawql.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

kubectl_ctx() {
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" "$@"
  else
    kubectl "$@"
  fi
}

echo "==> Deleting deployment/clawql-mcp-http and svc/clawql-mcp-http (namespace clawql)"
kubectl_ctx -n clawql delete deployment/clawql-mcp-http svc/clawql-mcp-http --ignore-not-found=true
echo "==> Done. Run: make local-k8s-up"
