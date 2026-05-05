#!/usr/bin/env bash
set -euo pipefail
# Smoke-test MCP gRPC through the Istio ingress gateway (local desktop k8s: localhost:50051).
#
# Prerequisites:
#   - grpcurl on PATH (https://github.com/fullstorydev/grpcurl — e.g. brew install grpcurl)
#   - A cluster where install-istio-docker-desktop.sh + ClawQL are up with ENABLE_GRPC (values-docker-desktop enables gRPC)
#
# Optional env:
#   CLAWQL_GRPC_GATEWAY_HOST (default localhost)
#   CLAWQL_GRPC_GATEWAY_PORT (default 50051)
#   kubectl context: same as local-k8s-docker-desktop.sh (rancher-desktop / docker-desktop probe)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v grpcurl >/dev/null 2>&1; then
  echo "ERROR: grpcurl not found. Install: https://github.com/fullstorydev/grpcurl"
  exit 1
fi

HOST="${CLAWQL_GRPC_GATEWAY_HOST:-localhost}"
PORT="${CLAWQL_GRPC_GATEWAY_PORT:-50051}"
TARGET="${HOST}:${PORT}"

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

kubectl_ctx() {
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" "$@"
  else
    kubectl "$@"
  fi
}

if ! kubectl_ctx cluster-info >/dev/null 2>&1; then
  echo "ERROR: kubectl cannot reach the cluster (context: ${KUBE_CONTEXT:-current})"
  exit 1
fi

echo "==> grpcurl grpc.health.v1.Health/Check (plaintext) → ${TARGET}"
grpcurl -plaintext -max-time 15 -d '{"service":""}' "${TARGET}" grpc.health.v1.Health/Check

echo "OK: gRPC health via Istio gateway path succeeded."
