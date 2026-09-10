#!/usr/bin/env bash
# Smoke: demo Privacy Filter sidecar (no model weights).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-18091}"
export PORT
export PRIVACY_FILTER_MODE=demo

python3 "${ROOT}/server.py" &
PID=$!
cleanup() { kill "${PID}" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 0.1
done

curl -sf "http://127.0.0.1:${PORT}/health" | grep -q '"ok": true'
OUT="$(curl -sf -X POST "http://127.0.0.1:${PORT}/redact" \
  -H 'content-type: application/json' \
  -d '{"text":"Employee: Name: Jane Q Public email jane@example.com token sk-abcdefghijklmnopqrstuvwxyz012345"}')"
echo "${OUT}" | grep -q 'PRIVATE_EMAIL\|private_email\|\[PRIVATE_EMAIL\]'
echo "${OUT}" | grep -q 'SECRET\|secret\|\[SECRET\]'
echo "${OUT}" | grep -q '"local": true'
echo "OK: privacy-filter-http demo smoke passed"
