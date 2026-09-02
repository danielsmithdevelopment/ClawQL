#!/usr/bin/env bash
# Smoke test for examples/streams-celld (Lab 5b + clawql-core + MCP fetch).
# Requires celld v0.4.0 + esbuild on PATH; workspace clawql-core built.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${CELLD_DEV_PORT:-9880}"
MCP_PORT="${MOCK_MCP_PORT:-9891}"
BASE="http://127.0.0.1:${PORT}"
SMOKE_CFG="$ROOT/wrangler.smoke.jsonc"

if ! command -v celld >/dev/null 2>&1; then
  echo "smoke: celld not on PATH — skip (install CELLD_VERSION=v0.4.0)" >&2
  exit 0
fi

node "$ROOT/scripts/bundle-check.mjs"
node "$ROOT/scripts/mcp-fetch.test.mjs"

# Mock MCP for search/execute (stateless JSON tools/call).
node "$ROOT/scripts/mock-mcp-server.mjs" "$MCP_PORT" &
MCP_PID=$!

# Point Worker vars at mock MCP (celld accepts a Wrangler config path).
python3 - "$ROOT/wrangler.jsonc" "$SMOKE_CFG" "$MCP_PORT" <<'PY'
import json, re, sys
src, dst, port = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read()
text = re.sub(r"/\*[\s\S]*?\*/", "", text)
text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
cfg = json.loads(text)
cfg.setdefault("vars", {})
cfg["vars"]["CLAWQL_MCP_URL"] = f"http://127.0.0.1:{port}/mcp"
cfg["vars"]["INFERENCE_URL"] = cfg["vars"].get("INFERENCE_URL") or "http://127.0.0.1:8080"
open(dst, "w", encoding="utf-8").write(json.dumps(cfg, indent=2) + "\n")
PY

cd "$ROOT"
celld dev "$SMOKE_CFG" --port "$PORT" &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
  kill "$MCP_PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  wait "$MCP_PID" 2>/dev/null || true
  rm -f "$SMOKE_CFG"
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -sf "$BASE/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

curl -sf "$BASE/health" | grep -q clawql-streams-celld-skeleton

RESP=$(curl -sf -X POST "$BASE/webhook/smoke" \
  -H 'content-type: application/json' \
  -H 'x-clawql-event-id: smoke-mcp-1' \
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
echo "$RESP" | grep -q 'streamable-http' || fail "expected MCP streamable-http transport"
echo "$RESP" | grep -q '"source":"mock-mcp"' || fail "expected mock-mcp search/execute payload"
echo "$RESP" | grep -q '"mcpUrlConfigured":true' || fail "expected mcpUrlConfigured true"

echo "smoke: PASS"
