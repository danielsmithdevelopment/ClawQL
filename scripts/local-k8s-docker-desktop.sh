#!/usr/bin/env bash
set -euo pipefail

# Install ClawQL on Docker Desktop Kubernetes.
#
# Default: Helm (charts/clawql-mcp + values-docker-desktop.yaml).
# Optional: Kustomize — set CLAWQL_LOCAL_K8S_INSTALLER=kustomize (no Helm required).
#
# Optional: CLAWQL_LOCAL_K8S_BUILD_IMAGE=1 — docker build locally and deploy
# image clawql-mcp:latest (IfNotPresent) instead of pulling from GHCR.
#
# Requires: Docker Desktop with Kubernetes enabled, kubectl. Helm is required only
# when using the default installer. Docker is only required when
# CLAWQL_LOCAL_K8S_BUILD_IMAGE=1.
#
# Uses kube context `docker-desktop` when present (avoids targeting EKS/other clusters).
#
# Usage:
#   bash scripts/local-k8s-docker-desktop.sh
#   CLAWQL_LOCAL_K8S_INSTALLER=kustomize bash scripts/local-k8s-docker-desktop.sh
#
# MCP (after LoadBalancer is ready): http://localhost:8080/mcp
# Health: curl -s http://localhost:8080/healthz

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INSTALLER="${CLAWQL_LOCAL_K8S_INSTALLER:-helm}"
CHART="${ROOT}/charts/clawql-mcp"
VALUES_LOCAL="${CHART}/values-docker-desktop.yaml"
KUSTOMIZE_OVERLAY="${ROOT}/docker/kustomize/overlays/local"
RELEASE_NAME="${HELM_RELEASE_NAME:-clawql}"
NAMESPACE="${HELM_NAMESPACE:-clawql}"

# Mount a host Obsidian vault (same default as docker-compose: ~/.ClawQL).
VAULT_HOST_PATH="${CLAWQL_LOCAL_VAULT_HOST_PATH:-$HOME/.ClawQL}"

echo "==> Installer: ${INSTALLER} (set CLAWQL_LOCAL_K8S_INSTALLER=kustomize for Kustomize)"
echo "==> Obsidian vault hostPath (clawql-mcp-http): ${VAULT_HOST_PATH}"
echo "    (override with CLAWQL_LOCAL_VAULT_HOST_PATH=/absolute/path/to/vault)"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl not found. Enable Kubernetes in Docker Desktop and ensure kubectl is on PATH."
  exit 1
fi

if [[ "${INSTALLER}" == "helm" ]]; then
  if ! command -v helm >/dev/null 2>&1; then
    echo "ERROR: helm not found. Install Helm 3: https://helm.sh/docs/intro/install/"
    echo "       Or use Kustomize only: CLAWQL_LOCAL_K8S_INSTALLER=kustomize"
    exit 1
  fi
elif [[ "${INSTALLER}" == "kustomize" ]]; then
  :
else
  echo "ERROR: CLAWQL_LOCAL_K8S_INSTALLER must be 'helm' or 'kustomize' (got: ${INSTALLER})"
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

if [[ "${CLAWQL_LOCAL_K8S_BUILD_IMAGE:-}" == "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not found (required for CLAWQL_LOCAL_K8S_BUILD_IMAGE=1)."
    exit 1
  fi
  echo "==> Building local image clawql-mcp:latest (CLAWQL_LOCAL_K8S_BUILD_IMAGE=1)"
  docker build -f docker/Dockerfile -t clawql-mcp:latest .
fi

if [[ "${INSTALLER}" == "helm" ]]; then
  HELM_EXTRA=()
  if [[ "${CLAWQL_LOCAL_K8S_BUILD_IMAGE:-}" == "1" ]]; then
    HELM_EXTRA+=(--set-string "image.repository=clawql-mcp" --set-string "image.tag=latest" --set-string "image.pullPolicy=IfNotPresent")
  else
    echo "==> Using registry image from ${VALUES_LOCAL}"
  fi

  echo "==> helm upgrade --install ${RELEASE_NAME} (${NAMESPACE})"

  HELM_CMD=(helm upgrade --install "${RELEASE_NAME}" "${CHART}")
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    HELM_CMD+=(--kube-context "${KUBE_CONTEXT}")
  fi
  HELM_CMD+=(
    --namespace "${NAMESPACE}"
    --create-namespace
    -f "${VALUES_LOCAL}"
    --set-string "vault.hostPath.path=${VAULT_HOST_PATH}"
    --wait
    --timeout 10m
  )
  if ((${#HELM_EXTRA[@]})); then
    HELM_CMD+=("${HELM_EXTRA[@]}")
  fi

  set +e
  "${HELM_CMD[@]}"
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

  if [[ "${CLAWQL_LOCAL_K8S_BUILD_IMAGE:-}" == "1" ]]; then
    echo "==> Patching Deployment to use local image clawql-mcp:latest"
    kubectl_ctx -n "${NAMESPACE}" patch deployment clawql-mcp-http --type=json -p='[
      {"op":"replace","path":"/spec/template/spec/containers/0/image","value":"clawql-mcp:latest"},
      {"op":"replace","path":"/spec/template/spec/containers/0/imagePullPolicy","value":"IfNotPresent"}
    ]'
  fi
fi

echo "==> Rollout status"
kubectl_ctx -n "${NAMESPACE}" rollout status deployment/clawql-mcp-http --timeout=300s

echo ""
echo "==> Services"
kubectl_ctx -n "${NAMESPACE}" get svc

echo ""
echo "MCP HTTP endpoint: http://localhost:8080/mcp"
echo "Health check:       curl -s http://localhost:8080/healthz"
echo ""
echo "If EXTERNAL-IP stays <pending>, wait a few seconds and run: kubectl -n ${NAMESPACE} get svc"
