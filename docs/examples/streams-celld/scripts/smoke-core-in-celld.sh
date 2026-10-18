#!/usr/bin/env bash
# Prove search + execute run inside CoreToolsDO (celld isolate), not Node MCP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${CELLD_DEV_PORT:-9888}"
PETS_PORT="${MOCK_PETS_PORT:-9893}"
BASE="http://127.0.0.1:${PORT}"
SMOKE_CFG="$ROOT/wrangler.core-in-celld.smoke.jsonc"

if ! command -v celld >/dev/null 2>&1; then
  if [[ "${STREAMS_CELLD_SMOKE_REQUIRED:-0}" == "1" ]]; then
    echo "smoke-core-in-celld: FAIL — celld not on PATH" >&2
    exit 1
  fi
  echo "smoke-core-in-celld: celld not on PATH — skip" >&2
  exit 0
fi

node "$ROOT/scripts/bundle-check.mjs"
node "$ROOT/scripts/core-catalog.test.mjs"

node "$ROOT/scripts/mock-pets-upstream.mjs" "$PETS_PORT" &
PETS_PID=$!

python3 - "$ROOT/wrangler.jsonc" "$SMOKE_CFG" "$PETS_PORT" <<'PY'
import json, re, sys
src, dst, pets_port = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read()
text = re.sub(r"/\*[\s\S]*?\*/", "", text)
text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
cfg = json.loads(text)
cfg.setdefault("vars", {})
cfg["vars"]["CLAWQL_CORE_IN_CELLD"] = "1"
cfg["vars"]["CLAWQL_CORE_UPSTREAM"] = f"http://127.0.0.1:{pets_port}"
# No Node MCP — Core search/execute must succeed in-isolate.
cfg["vars"]["CLAWQL_MCP_URL"] = ""
cfg["vars"]["CLAWQL_MCP_ADAPTER_URL"] = ""
cfg["vars"]["INFERENCE_URL"] = ""
open(dst, "w", encoding="utf-8").write(json.dumps(cfg, indent=2) + "\n")
PY

cd "$ROOT"
celld dev "$SMOKE_CFG" --port "$PORT" &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
  kill "$PETS_PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  wait "$PETS_PID" 2>/dev/null || true
  rm -f "$SMOKE_CFG"
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 40); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "smoke-core-in-celld: FAIL — celld exited early" >&2
    exit 1
  fi
  if curl -sf "$BASE/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == "1" ]] || { echo "smoke-core-in-celld: FAIL — health never ready" >&2; exit 1; }

curl -sf "$BASE/core/health" | tee /tmp/core-tools-health.json | grep -q CoreToolsDO

# Direct MCP tools/call into the isolate
SEARCH=$(curl -sf -X POST "$BASE/mcp" \
  -H 'content-type: application/json' \
  -H 'accept: application/json' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"query":"listPets","limit":3}}}')
echo "$SEARCH" | tee /tmp/core-in-celld-search.json | grep -q celld-isolate
echo "$SEARCH" | grep -q listPets
echo "$SEARCH" | grep -q CoreToolsDO

EXEC=$(curl -sf -X POST "$BASE/mcp" \
  -H 'content-type: application/json' \
  -H 'accept: application/json' \
  -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute","arguments":{"operationId":"listPets","args":{}}}}')
echo "$EXEC" | tee /tmp/core-in-celld-execute.json | grep -q celld-isolate
echo "$EXEC" | grep -q celld-core

# AgentSession path also uses CoreToolsDO for search/execute
EVENT_ID="core-in-celld-$(date +%s)-$$"
RESP=$(curl -sf -X POST "$BASE/webhook/core-in-celld" \
  -H 'content-type: application/json' \
  -H "x-clawql-event-id: ${EVENT_ID}" \
  -d '{"probe":true}')
echo "$RESP" | tee /tmp/core-in-celld-webhook.json | grep -q '"coreInCelld":true'
echo "$RESP" | grep -q celld-isolate
echo "$RESP" | grep -q '"inCell":true'

mkdir -p /opt/cursor/artifacts
cp /tmp/core-in-celld-search.json /tmp/core-in-celld-execute.json /tmp/core-in-celld-webhook.json /opt/cursor/artifacts/ 2>/dev/null || true

echo "smoke-core-in-celld: PASS"
