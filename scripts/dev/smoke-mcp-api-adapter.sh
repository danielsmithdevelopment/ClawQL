#!/usr/bin/env bash
# Smoke-test mcp-api-adapter: unit tests + optional live demo surfaces.
# Usage:
#   scripts/dev/smoke-mcp-api-adapter.sh           # build + vitest
#   scripts/dev/smoke-mcp-api-adapter.sh --live    # also start demo server + demo-all
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

LIVE=0
for arg in "$@"; do
  case "$arg" in
    --live) LIVE=1 ;;
    -h|--help)
      echo "Usage: $0 [--live]"
      exit 0
      ;;
  esac
done

echo "== build mcp-grpc-transport + mcp-api-adapter =="
npm run build -w mcp-grpc-transport
npm run build -w mcp-api-adapter

echo "== vitest =="
npm test -w mcp-api-adapter

if [ "$LIVE" != "1" ]; then
  echo "OK (unit). Re-run with --live for REST/GraphQL/gRPC parity against examples/mcp-api-adapter/server.mjs"
  exit 0
fi

export OPENAPI_PORT="${OPENAPI_PORT:-8090}"
export GRPC_PORT="${GRPC_PORT:-50051}"
BASE="http://127.0.0.1:${OPENAPI_PORT}"

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "== start demo server (OpenAPI ${OPENAPI_PORT}, gRPC ${GRPC_PORT}) =="
node examples/mcp-api-adapter/server.mjs &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -sf "$BASE/healthz" >/dev/null; then
    break
  fi
  sleep 0.25
done
curl -sf "$BASE/healthz" | head -c 400
echo

echo "== demo-all (REST / GraphQL / gRPC parity) =="
OPENAPI_BASE_URL="$BASE" CLAWQL_MCP_GRPC_ADDR="127.0.0.1:${GRPC_PORT}" \
  node examples/mcp-api-adapter/demo-all.mjs

echo "== gen-cli =="
OUT="$(mktemp -d)"
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs gen-cli \
  --out "$OUT" --grpc-address "127.0.0.1:${GRPC_PORT}"
MCP_API_ADAPTER_BASE_URL="$BASE" node "$OUT/bin/mcp-tools.mjs" echo --message smoke-ok
rm -rf "$OUT"

echo "OK (live smoke)"
