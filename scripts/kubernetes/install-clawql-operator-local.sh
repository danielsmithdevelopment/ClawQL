#!/usr/bin/env bash
# Install clawql-operator + default ClawQLInstance for local desktop k8s (#255).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAMESPACE="${CLAWQL_OPERATOR_NAMESPACE:-clawql-system}"
MCP_NAMESPACE="${CLAWQL_TARGET_NAMESPACE:-clawql}"
KUBE_CONTEXT="${CLAWQL_LOCAL_K8S_CONTEXT:-}"
OPERATOR_RELEASE="${CLAWQL_OPERATOR_RELEASE:-clawql-operator}"
MCP_RELEASE="${CLAWQL_HELM_RELEASE:-clawql-mcp}"
CHART="${ROOT}/charts/clawql-operator"
MCP_CHART="${ROOT}/charts/clawql-mcp"

kubectl_ctx() {
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" "$@"
  else
    kubectl "$@"
  fi
}

helm_ctx() {
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    helm --kube-context "${KUBE_CONTEXT}" "$@"
  else
    helm "$@"
  fi
}

echo "==> Installing ClawQL operator (${OPERATOR_RELEASE} in ${NAMESPACE})"
helm_ctx upgrade --install "${OPERATOR_RELEASE}" "${CHART}" \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  --set operator.mode=deployment \
  --set operator.enabled=true \
  --wait --timeout 5m

echo "==> Applying ClawQLInstance in ${MCP_NAMESPACE}"
kubectl_ctx apply -f "${ROOT}/examples/operator/clawqlinstance-minimal.yaml" -n "${MCP_NAMESPACE}"

echo "==> Enabling MCP instanceSpec overlay on ${MCP_RELEASE}"
helm_ctx upgrade "${MCP_RELEASE}" "${MCP_CHART}" \
  --namespace "${MCP_NAMESPACE}" \
  --reuse-values \
  --set instanceSpec.enabled=true \
  --set instanceSpec.configMapName=clawql-tier-spec \
  --wait --timeout 10m

echo "==> Operator install complete"
echo "    kubectl -n ${MCP_NAMESPACE} get clawqlinstances"
echo "    kubectl -n ${MCP_NAMESPACE} get configmap clawql-tier-spec"
