#!/usr/bin/env bash
# Smoke: Docker image includes all workspace packages so node_modules symlinks resolve.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

IMAGE="clawql-mcp:ci-distribution-smoke"
CONTAINER="clawql-mcp-distribution-smoke"

docker build -f docker/Dockerfile --target runtime -t "${IMAGE}" .

docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
# Image binds 0.0.0.0 so published ports work; non-loopback noAuth is refused —
# smoke uses a throwaway apiKey (same pattern as docker-compose.yml).
docker run -d --name "${CONTAINER}" -p 18080:8080 \
  -e CLAWQL_AUTH_MODE=apiKey \
  -e CLAWQL_API_KEY=ci-distribution-smoke-only \
  "${IMAGE}" >/dev/null

trap 'docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:18080/healthz" >/dev/null 2>&1; then
    echo "OK: Docker MCP /healthz"
    exit 0
  fi
  sleep 2
done

echo "ERROR: timed out waiting for http://127.0.0.1:18080/healthz" >&2
docker logs "${CONTAINER}" 2>&1 | tail -40 >&2 || true
exit 1
