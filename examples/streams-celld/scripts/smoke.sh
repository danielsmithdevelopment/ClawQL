#!/usr/bin/env bash
# Smoke test for examples/streams-celld (Lab 5b + clawql-core embed).
# Requires celld v0.4.0 + esbuild on PATH; workspace clawql-core built.
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

for _ in $(seq 1 40); do
  if curl -sf "$BASE/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

curl -sf "$BASE/health" | grep -q clawql-streams-celld-skeleton

RESP=$(curl -sf -X POST "$BASE/webhook/smoke" \
  -H 'content-type: application/json' \
  -H 'x-clawql-event-id: smoke-core-1' \
  -d '{"probe":true}')

fail() {
  echo "smoke: FAIL - $1" >&2
  echo "$RESP" >&2
  exit 1
}

echo "$RESP" | grep -q '"action":"spawn"' || fail "expected action spawn"
echo "$RESP" | grep -q 'clawql-core/streams-slim' || fail "expected clawql-core/streams-slim"
echo "$RESP" | grep -q '"hash":' || fail "expected hash-chained audit append"
echo "$RESP" | grep -q 'streams:session:' || fail "expected cache session key"

echo "smoke: PASS"
