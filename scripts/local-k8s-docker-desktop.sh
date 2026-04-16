#!/usr/bin/env bash
set -euo pipefail

# Build the ClawQL image and apply the Kustomize "local" overlay to Docker Desktop Kubernetes.
# Requires: Docker Desktop with Kubernetes enabled, kubectl, docker.
#
# Uses kubectl context `docker-desktop` when present (avoids accidentally targeting EKS/other clusters).
#
# Usage:
#   bash scripts/local-k8s-docker-desktop.sh
#
# MCP (after LoadBalancer is ready): http://localhost:8080/mcp
# Health: curl -s http://localhost:8080/healthz

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OVERLAY="${ROOT}/docker/kustomize/overlays/local"

# Mount a host Obsidian vault at the same path as docker-compose (CLAWQL_VAULT_HOST_PATH → /vault).
# Base deployment uses emptyDir — without this patch, memory_ingest only persists in the pod.
VAULT_HOST_PATH="${CLAWQL_LOCAL_VAULT_HOST_PATH:-$HOME/.ClawQL}"
# JSON Patch (RFC 6902): strategic-merge YAML would merge hostPath into the base volume
# alongside emptyDir ("may not specify more than one volume type"). Replace volumes[0].
PATCH_FILE="${OVERLAY}/patch-mcp-vault-hostpath.json"
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
echo "==> Obsidian vault hostPath (clawql-mcp-http): ${VAULT_HOST_PATH}"
echo "    (override with CLAWQL_LOCAL_VAULT_HOST_PATH=/absolute/path/to/vault)"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl not found. Enable Kubernetes in Docker Desktop and ensure kubectl is on PATH."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found."
  exit 1
fi

# Prefer Docker Desktop's context so we don't deploy to another cluster (e.g. EKS).
KUBECTL_FLAG=()
if kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-desktop'; then
  KUBECTL_FLAG=(--context docker-desktop)
  echo "==> kubectl context: docker-desktop"
elif kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-for-desktop'; then
  KUBECTL_FLAG=(--context docker-for-desktop)
  echo "==> kubectl context: docker-for-desktop"
else
  CUR="$(kubectl config current-context 2>/dev/null || true)"
  echo "WARN: No docker-desktop context in kubeconfig; using current context: ${CUR:-none}"
  echo "      If this fails, run: kubectl config use-context docker-desktop"
fi

if ! kubectl "${KUBECTL_FLAG[@]}" cluster-info >/dev/null 2>&1; then
  echo "ERROR: kubectl cannot reach the cluster with the selected context."
  echo "Enable Kubernetes in Docker Desktop, then try: kubectl config use-context docker-desktop"
  exit 1
fi

echo "==> Building image clawql-mcp:latest"
docker build -f docker/Dockerfile -t clawql-mcp:latest .

echo "==> Applying ${OVERLAY}"
kubectl "${KUBECTL_FLAG[@]}" apply -k "${OVERLAY}"

echo "==> Waiting for rollouts (namespace clawql)"
kubectl "${KUBECTL_FLAG[@]}" -n clawql rollout status deployment/clawql-graphql --timeout=300s
kubectl "${KUBECTL_FLAG[@]}" -n clawql rollout status deployment/clawql-mcp-http --timeout=300s

echo ""
echo "==> Services"
kubectl "${KUBECTL_FLAG[@]}" -n clawql get svc

echo ""
echo "MCP HTTP endpoint: http://localhost:8080/mcp"
echo "Health check:       curl -s http://localhost:8080/healthz"
echo ""
echo "If EXTERNAL-IP stays <pending>, wait a few seconds and run: kubectl -n clawql get svc"
