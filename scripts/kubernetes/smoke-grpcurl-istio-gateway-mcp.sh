#!/usr/bin/env bash
set -euo pipefail
# Smoke-test MCP gRPC through the Istio ingress gateway (Docker Desktop: localhost:50051).
#
# Prerequisites:
#   - grpcurl on PATH (https://github.com/fullstorydev/grpcurl — e.g. brew install grpcurl)
#   - A cluster where install-istio-docker-desktop.sh + ClawQL are up with ENABLE_GRPC (values-docker-desktop enables gRPC)
#
# Optional env:
#   CLAWQL_GRPC_GATEWAY_HOST (default localhost)
#   CLAWQL_GRPC_GATEWAY_PORT (default 50051)
#   kubectl context: same as local-k8s-docker-desktop.sh (docker-desktop when present)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v grpcurl >/dev/null 2>&1; then
  echo "ERROR: grpcurl not found. Install: https://github.com/fullstorydev/grpcurl"
  exit 1
fi

HOST="${CLAWQL_GRPC_GATEWAY_HOST:-localhost}"
PORT="${CLAWQL_GRPC_GATEWAY_PORT:-50051}"
TARGET="${HOST}:${PORT}"

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

if ! kubectl_ctx cluster-info >/dev/null 2>&1; then
  echo "ERROR: kubectl cannot reach the cluster (context: ${KUBE_CONTEXT:-current})"
  exit 1
fi

echo "==> grpcurl grpc.health.v1.Health/Check (plaintext) → ${TARGET}"
grpcurl -plaintext -max-time 15 -d '{"service":""}' "${TARGET}" grpc.health.v1.Health/Check

echo "OK: gRPC health via Istio gateway path succeeded."
