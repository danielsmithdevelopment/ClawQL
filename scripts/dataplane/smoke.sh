#!/usr/bin/env bash
# Phase A smoke: SQLite catalog + Streamable HTTP session + execute/where.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/crates"

pick_free_bind() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(f"127.0.0.1:{s.getsockname()[1]}")
s.close()
PY
}

if [ -n "${CLAWQL_DATAPLANE_BIND:-}" ]; then
  BIND="$CLAWQL_DATAPLANE_BIND"
else
  BIND="$(pick_free_bind)"
fi

CATALOG="${CLAWQL_DATAPLANE_CATALOG:-${CLAWQL_CATALOG_SQLITE_PATH:-$ROOT/crates/clawql-dataplane/fixtures/catalog.sqlite}}"
ACCEPT='application/json, text/event-stream'

cargo build -p clawql-dataplane --quiet
cargo run -p clawql-dataplane --quiet -- --self-mock --bind "$BIND" --catalog "$CATALOG" &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 80); do
  if curl -sf "http://${BIND}/healthz" >/dev/null; then break; fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "dataplane exited before healthy (bind=$BIND)" >&2
    exit 1
  fi
  sleep 0.1
  if [ "$i" -eq 80 ]; then echo "dataplane did not become healthy (bind=$BIND)" >&2; exit 1; fi
done

INIT_HEADERS=$(mktemp)
curl -sf "http://${BIND}/mcp" \
  -H "content-type: application/json" \
  -H "accept: ${ACCEPT}" \
  -D "$INIT_HEADERS" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | tee /tmp/dataplane-init.json | grep -q clawql-dataplane

SID=$(awk -F': ' 'tolower($1)=="mcp-session-id"{gsub(/\r/,"",$2); print $2; exit}' "$INIT_HEADERS")
if [ -z "$SID" ]; then
  echo "missing mcp-session-id on initialize" >&2
  cat "$INIT_HEADERS" >&2
  exit 1
fi

curl -sf "http://${BIND}/mcp" \
  -H "content-type: application/json" \
  -H "accept: ${ACCEPT}" \
  -H "mcp-session-id: ${SID}" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  -o /dev/null -w '%{http_code}' | grep -q 202

OUT=$(curl -sf "http://${BIND}/mcp" \
  -H "content-type: application/json" \
  -H "accept: ${ACCEPT}" \
  -H "mcp-session-id: ${SID}" \
  -H "mcp-protocol-version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute","arguments":{"operationId":"mock_listPets","where":"pets[?tag=='"'"'a'"'"']"}}}')
echo "$OUT" | tee /tmp/dataplane-execute.json

echo "$OUT" | grep -q '"ok":true\|ok\\":true'
echo "$OUT" | grep -q '"tag":"a"\|\\"tag\\":\\"a\\"'
if echo "$OUT" | grep -q '"tag":"b"\|\\"tag\\":\\"b\\"'; then
  echo "where filter failed: tag=b still present" >&2
  exit 1
fi
echo "$OUT" | grep -q 'fast-path-only\|phase-a-none'

echo "bind=${BIND} session=${SID} catalog=${CATALOG} pid=${PID}"
echo "smoke ok"
