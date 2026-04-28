#!/usr/bin/env bash
set -euo pipefail

# Install ClawQL on Docker Desktop Kubernetes.
#
# Default: Helm (charts/clawql-mcp + values-docker-desktop.yaml).
# Optional: Kustomize — set CLAWQL_LOCAL_K8S_INSTALLER=kustomize (Helm is still required for Kyverno).
#
# Admission: installs Kyverno and a ClusterPolicy (Cosign keyless verifyImages for ClawQL GHCR
# images). Unsigned local MCP/UI image builds are not supported — use signed images from GHCR.
#
# Optional: CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=1 — install/update ingress-nginx
# once in namespace ingress-nginx (enabled by default).
#
# Optional: CLAWQL_HELM_TIMEOUT — helm --wait timeout (default 30m). Full Onyx
# (Vespa, OpenSearch, model servers, image pulls) often needs more than 10m on first install.
#
# Optional: CLAWQL_KYVERNO_CHART_VERSION — Kyverno Helm chart version (default 3.7.2).
#
# Requires: Docker Desktop with Kubernetes enabled, kubectl, Helm 3. Docker is not required
# unless you use other tooling that needs it.
#
# Uses kube context `docker-desktop` when present (avoids targeting EKS/other clusters).
#
# Usage:
#   bash scripts/local-k8s-docker-desktop.sh
#   CLAWQL_LOCAL_K8S_INSTALLER=kustomize bash scripts/local-k8s-docker-desktop.sh
#
# MCP (after LoadBalancer is ready): http://localhost:8080/mcp
# UI (Ingress): http://clawql.localhost
# Health: curl -s http://localhost:8080/healthz

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INSTALLER="${CLAWQL_LOCAL_K8S_INSTALLER:-helm}"
CHART="${ROOT}/charts/clawql-mcp"
VALUES_LOCAL="${CHART}/values-docker-desktop.yaml"
KUSTOMIZE_OVERLAY="${ROOT}/docker/kustomize/overlays/local"
RELEASE_NAME="${HELM_RELEASE_NAME:-clawql}"
NAMESPACE="${HELM_NAMESPACE:-clawql}"
INSTALL_INGRESS_NGINX="${CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX:-1}"
HELM_TIMEOUT="${CLAWQL_HELM_TIMEOUT:-30m}"
KYVERNO_CHART_VERSION="${CLAWQL_KYVERNO_CHART_VERSION:-3.7.2}"

# Mount a host Obsidian vault (same default as docker-compose: ~/.ClawQL).
VAULT_HOST_PATH="${CLAWQL_LOCAL_VAULT_HOST_PATH:-$HOME/.ClawQL}"

echo "==> Installer: ${INSTALLER} (set CLAWQL_LOCAL_K8S_INSTALLER=kustomize for Kustomize)"
echo "==> Obsidian vault hostPath (clawql-mcp-http): ${VAULT_HOST_PATH}"
echo "    (override with CLAWQL_LOCAL_VAULT_HOST_PATH=/absolute/path/to/vault)"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl not found. Enable Kubernetes in Docker Desktop and ensure kubectl is on PATH."
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "ERROR: helm not found. local-k8s-up installs Kyverno via Helm and requires Helm 3."
  echo "       https://helm.sh/docs/intro/install/"
  exit 1
fi

if [[ "${INSTALLER}" != "helm" && "${INSTALLER}" != "kustomize" ]]; then
  echo "ERROR: CLAWQL_LOCAL_K8S_INSTALLER must be 'helm' or 'kustomize' (got: ${INSTALLER})"
  exit 1
fi

if [[ "${CLAWQL_LOCAL_K8S_BUILD_IMAGE:-}" == "1" ]]; then
  echo "ERROR: CLAWQL_LOCAL_K8S_BUILD_IMAGE=1 is not supported."
  echo "       local-k8s-up enforces Kyverno Cosign verification for ClawQL images from GHCR only."
  exit 1
fi

if [[ "${CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE:-0}" == "1" ]]; then
  echo "ERROR: CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE=1 is not supported."
  echo "       local-k8s-up pulls signed ghcr.io/danielsmithdevelopment/clawql-website (see values-docker-desktop.yaml)."
  exit 1
fi

KUBE_CONTEXT=""
if kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-desktop'; then
  KUBE_CONTEXT="docker-desktop"
  echo "==> kube context: docker-desktop"
elif kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-for-desktop'; then
  KUBE_CONTEXT="docker-for-desktop"
  echo "==> kube context: docker-for-desktop"
else
  CUR="$(kubectl config current-context 2>/dev/null || true)"
  echo "WARN: No docker-desktop context in kubeconfig; using current context: ${CUR:-none}"
  echo "      If this fails, run: kubectl config use-context docker-desktop"
fi

kubectl_ctx() {
  # kubectl uses --context (Helm uses --kube-context — do not mix them up).
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

if ! kubectl_ctx cluster-info >/dev/null 2>&1; then
  echo "ERROR: kubectl cannot reach the cluster with the selected context."
  echo ""
  echo "Checklist:"
  echo "  1. Docker Desktop is running (whale icon in the menu bar)."
  echo "  2. Settings → Kubernetes → Enable Kubernetes → Apply & Restart; wait until"
  echo "     the status shows Kubernetes running (green) in the Docker Desktop footer."
  echo "  3. Then: kubectl config use-context docker-desktop"
  echo ""
  echo "kubectl said:"
  kubectl_ctx cluster-info 2>&1 || true
  exit 1
fi

echo "==> Installing/upgrading Kyverno (chart ${KYVERNO_CHART_VERSION}; override with CLAWQL_KYVERNO_CHART_VERSION)"
helm repo add kyverno https://kyverno.github.io/kyverno/ >/dev/null 2>&1 || true
helm repo update >/dev/null
helm_ctx upgrade --install kyverno kyverno/kyverno \
  --version "${KYVERNO_CHART_VERSION}" \
  --namespace kyverno \
  --create-namespace \
  --wait \
  --timeout 10m

if [[ "${INSTALL_INGRESS_NGINX}" == "1" ]]; then
  echo "==> Installing/upgrading ingress-nginx controller"
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
  helm repo update >/dev/null
  helm_ctx upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --set controller.publishService.enabled=true \
    --wait \
    --timeout 10m
fi

if [[ "${INSTALLER}" == "helm" ]]; then
  echo "==> helm upgrade --install ${RELEASE_NAME} (${NAMESPACE}) (wait timeout ${HELM_TIMEOUT})"
  echo "    Note: first install with full Onyx can take a long time (image pulls + model servers)."
  echo "    Kyverno admits only Cosign-signed ghcr.io/danielsmithdevelopment/clawql-{mcp,website} in ${NAMESPACE}."

  set +e
  helm_ctx upgrade --install "${RELEASE_NAME}" "${CHART}" \
    --namespace "${NAMESPACE}" \
    --create-namespace \
    -f "${VALUES_LOCAL}" \
    --set-string "vault.hostPath.path=${VAULT_HOST_PATH}" \
    --wait \
    --timeout "${HELM_TIMEOUT}"
  HELM_EXIT=$?
  set -e
  if [[ "${HELM_EXIT}" -ne 0 ]]; then
    echo ""
    echo "Helm failed. If the error mentions existing resources / invalid ownership (e.g. after"
    echo "kubectl apply or Kustomize), delete the old MCP objects and retry:"
    echo "  make local-k8s-mcp-delete && make local-k8s-up"
    exit "${HELM_EXIT}"
  fi

else
  # Kustomize: JSON patch for hostPath vault (same as before Helm was default).
  PATCH_FILE="${KUSTOMIZE_OVERLAY}/patch-mcp-vault-hostpath.json"
  export VAULT_HOST_PATH
  python3 <<'PY' >"${PATCH_FILE}"
import json, os

path = os.environ["VAULT_HOST_PATH"]
patch = [
    {
        "op": "replace",
        "path": "/spec/template/spec/volumes/0",
        "value": {
            "name": "obsidian-vault",
            "hostPath": {"path": path, "type": "DirectoryOrCreate"},
        },
    }
]
print(json.dumps(patch))
PY

  echo "==> Applying Kustomize overlay ${KUSTOMIZE_OVERLAY}"
  kubectl_ctx apply -k "${KUSTOMIZE_OVERLAY}"

  echo "==> Applying Kyverno ClusterPolicy (from Helm chart template; release ${RELEASE_NAME})"
  helm_ctx template "${RELEASE_NAME}" "${CHART}" \
    -f "${VALUES_LOCAL}" \
    --set-string "vault.hostPath.path=${VAULT_HOST_PATH}" \
    --namespace "${NAMESPACE}" \
    --show-only templates/kyverno-clusterpolicy-cosign.yaml | kubectl_ctx apply -f -
fi

echo "==> Rollout status"
kubectl_ctx -n "${NAMESPACE}" rollout status deployment/clawql-mcp-http --timeout=300s

echo ""
echo "==> Services"
kubectl_ctx -n "${NAMESPACE}" get svc

echo ""
echo "MCP HTTP endpoint: http://localhost:8080/mcp"
echo "Health check:       curl -s http://localhost:8080/healthz"
echo "UI endpoint:        http://clawql.localhost"
echo ""
echo "If EXTERNAL-IP stays <pending>, wait a few seconds and run: kubectl -n ${NAMESPACE} get svc"
