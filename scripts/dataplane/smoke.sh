#!/usr/bin/env bash
# Phase A smoke: start dataplane with self-mock, call execute + where, note RSS.
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

cargo build -p clawql-dataplane --quiet
cargo run -p clawql-dataplane --quiet -- --self-mock --bind "$BIND" &
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

curl -sf "http://${BIND}/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | tee /tmp/dataplane-init.json | grep -q clawql-dataplane

OUT=$(curl -sf "http://${BIND}/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute","arguments":{"operationId":"mock_listPets","where":"pets[?tag=='"'"'a'"'"']"}}}')
echo "$OUT" | tee /tmp/dataplane-execute.json

# tools/call wraps result as MCP content; body must include filtered pets + ok
echo "$OUT" | grep -q 'mock_listPets\|"ok":true\|ok\\":true'
echo "$OUT" | grep -q '"tag":"a"\|\\"tag\\":\\"a\\"'
# filtered out tag=b pet
if echo "$OUT" | grep -q '"tag":"b"\|\\"tag\\":\\"b\\"'; then
  echo "where filter failed: tag=b still present" >&2
  exit 1
fi

RSS_KB=""
if [ -r "/proc/${PID}/status" ]; then
  RSS_KB=$(awk '/^VmRSS:/{print $2}' "/proc/${PID}/status")
fi
echo "bind=${BIND} pid=${PID} VmRSS_kB=${RSS_KB:-unknown}"
echo "smoke ok"
