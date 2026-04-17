#!/usr/bin/env bash
set -euo pipefail

# Delete the MCP Deployment + Service in namespace clawql so Helm can install cleanly.
# Use after switching from kubectl apply / Kustomize to Helm, or when Helm reports
# "invalid ownership metadata" on helm upgrade --install.
#
# Does not delete the namespace or other workloads (e.g. graphql, Langfuse) in clawql.

KUBE_CONTEXT=""
if kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-desktop'; then
  KUBE_CONTEXT="docker-desktop"
elif kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-for-desktop'; then
  KUBE_CONTEXT="docker-for-desktop"
fi

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
