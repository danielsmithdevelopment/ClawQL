#!/usr/bin/env bash
# Smoke test for examples/streams-celld (Lab 5b). Requires celld v0.4.0 + esbuild on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${CELLD_DEV_PORT:-9880}"
BASE="http://127.0.0.1:${PORT}"

if ! command -v celld >/dev/null 2>&1; then
  echo "smoke: celld not on PATH — skip (install CELLD_VERSION=v0.4.0)" >&2
  exit 0
fi

node "$ROOT/scripts/bundle-check.mjs"

cd "$ROOT"
celld dev --port "$PORT" &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "$BASE/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

curl -sf "$BASE/health" | grep -q clawql-streams-celld-skeleton
curl -sf -X POST "$BASE/webhook/smoke" \
  -H 'content-type: application/json' \
  -H 'x-clawql-event-id: smoke-1' \
  -d '{"probe":true}' | grep -q '"action":"spawn"'

echo "smoke: PASS"
