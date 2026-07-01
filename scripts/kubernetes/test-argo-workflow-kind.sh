#!/usr/bin/env bash
# Optional kind + Argo Workflows smoke — gated in CI by CLAWQL_ENABLE_ARGO_WORKFLOWS_KIND_CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

if ! command -v kind >/dev/null 2>&1; then
  echo "Installing kind..."
  curl -fsSL "https://kind.sigs.k8s.io/dl/v0.29.0/kind-linux-amd64" -o /tmp/kind
  chmod +x /tmp/kind
  sudo mv /tmp/kind /usr/local/bin/kind
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required" >&2
  exit 1
fi

CLUSTER_NAME="clawql-argo-test"
ARGO_VERSION="${CLAWQL_ARGO_WORKFLOWS_VERSION:-v3.5.12}"
NS="clawql"

cleanup() {
  kind delete cluster --name "${CLUSTER_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

kind create cluster --name "${CLUSTER_NAME}" --wait 120s
KUBECONFIG="$(kind get kubeconfig --name "${CLUSTER_NAME}")"
export KUBECONFIG

kubectl create namespace argo
kubectl create namespace "${NS}"

kubectl apply -n argo -f "https://github.com/argoproj/argo-workflows/releases/download/${ARGO_VERSION}/install.yaml"
kubectl -n argo wait --for=condition=available deployment/argo-server --timeout=180s
kubectl -n argo wait --for=condition=available deployment/workflow-controller --timeout=180s

# Minimal SA for workflow creation in test namespace
kubectl -n "${NS}" create serviceaccount clawql-workflow-test
kubectl -n argo get role argo-server -o yaml 2>/dev/null | head -1 >/dev/null || true
kubectl create clusterrolebinding clawql-workflow-test-admin \
  --clusterrole=cluster-admin \
  --serviceaccount="${NS}:clawql-workflow-test" 2>/dev/null || \
  kubectl create rolebinding clawql-workflow-test --clusterrole=edit --serviceaccount="${NS}:clawql-workflow-test" -n "${NS}"

kubectl apply -n "${NS}" -f deployment/argo-workflows/templates/clawql-vault-daily-digest.yaml

export CLAWQL_ENABLE_WORKFLOW=1
export CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST="${NS}"
export CLAWQL_WORKFLOW_DEFAULT_NAMESPACE="${NS}"
export CLAWQL_ARGO_WORKFLOWS_INTEGRATION=1

# Use kind kubeconfig via default path
npx vitest run packages/clawql-automation/src/workflow/workflow.integration.test.ts

echo "argo-workflow-kind-integration OK"
