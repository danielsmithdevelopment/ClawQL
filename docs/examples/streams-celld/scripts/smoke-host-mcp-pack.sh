#!/usr/bin/env bash
# Prove host MCP can search+execute streams.session.noop with the Lab 5b OpenAPI pack
# (closes the empty-catalog honesty gap on the Bun/host escape path).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../../.." && pwd)"
MCP_PORT="${HOST_MCP_PACK_PORT:-9871}"
PETS_PORT="${HOST_MCP_PETS_PORT:-9872}"
VAULT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/streams-host-mcp-vault.XXXXXX")"
MCP_LOG="$(mktemp "${TMPDIR:-/tmp}/streams-host-mcp.XXXXXX.log")"
LAB5B_OPENAPI="$ROOT/openapi/streams-lab5b.openapi.json"

cleanup() {
  local ec=$?
  [[ -n "${MCP_PID:-}" ]] && kill "$MCP_PID" 2>/dev/null || true
  [[ -n "${PETS_PID:-}" ]] && kill "$PETS_PID" 2>/dev/null || true
  sleep 0.3
  [[ -n "${MCP_PID:-}" ]] && kill -9 "$MCP_PID" 2>/dev/null || true
  [[ -n "${PETS_PID:-}" ]] && kill -9 "$PETS_PID" 2>/dev/null || true
  rm -rf "$VAULT_DIR" 2>/dev/null || true
  exit "$ec"
}
trap cleanup EXIT

if [[ ! -f "$REPO/bin/clawql-mcp-http.mjs" ]]; then
  echo "smoke-host-mcp-pack: FAIL — missing bin/clawql-mcp-http.mjs" >&2
  exit 1
fi

node "$ROOT/scripts/openapi-pack.test.mjs"
node "$ROOT/scripts/mock-pets-upstream.mjs" "$PETS_PORT" &
PETS_PID=$!

(
  cd "$REPO"
  export PORT="$MCP_PORT"
  export MCP_PATH=/mcp
  export CLAWQL_ALLOW_NO_ENFORCEMENT=1
  export CLAWQL_CAPABILITY_LIFECYCLE=0
  export CLAWQL_ENABLE_MEMORY=1
  export CLAWQL_OBSIDIAN_VAULT_PATH="$VAULT_DIR"
  export CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1
  export CLAWQL_MCP_STATELESS=1
  export CLAWQL_SPEC_PATH="$LAB5B_OPENAPI"
  export CLAWQL_API_BASE_URL="http://127.0.0.1:${PETS_PORT}"
  export CLAWQL_OPENAPI_EXECUTE_PATH=rest
  unset CLAWQL_BUNDLED_PROVIDERS || true
  exec node bin/clawql-mcp-http.mjs
) >"$MCP_LOG" 2>&1 &
MCP_PID=$!

for _ in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:${MCP_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    echo "smoke-host-mcp-pack: FAIL — mcp exited early" >&2
    tail -50 "$MCP_LOG" >&2 || true
    exit 1
  fi
  sleep 0.25
done
curl -sf "http://127.0.0.1:${MCP_PORT}/healthz" >/dev/null || {
  echo "smoke-host-mcp-pack: FAIL — healthz never ready" >&2
  tail -50 "$MCP_LOG" >&2 || true
  exit 1
}

python3 - "$MCP_PORT" <<'PY'
import json, re, sys, urllib.request

port = sys.argv[1]
base = f"http://127.0.0.1:{port}/mcp"

def post(payload, session=None):
    data = json.dumps(payload).encode()
    headers = {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
    }
    if session:
        headers["mcp-session-id"] = session
    req = urllib.request.Request(base, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=45) as res:
        sid = res.headers.get("mcp-session-id")
        body = res.read().decode()
        if "data:" in body and not body.lstrip().startswith("{"):
            last = None
            for line in body.splitlines():
                if line.startswith("data:"):
                    last = line[5:].strip()
            body = last or "{}"
        return json.loads(body), sid

def tool_text(msg):
    chunks = []
    for c in (msg.get("result") or {}).get("content") or []:
        if c.get("type") == "text":
            chunks.append(c.get("text") or "")
    return "\n".join(chunks)

init, sid = post({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-11-25",
        "capabilities": {},
        "clientInfo": {"name": "smoke-host-mcp-pack", "version": "0.0.0"},
    },
})
if "error" in init:
    raise SystemExit(f"initialize error: {init}")
try:
    post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}, session=sid)
except Exception:
    pass

search, _ = post({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {"name": "search", "arguments": {"query": "streams.session.noop", "limit": 5}},
}, session=sid)
if "error" in search:
    raise SystemExit(f"search error: {search}")
st = tool_text(search)
if "streams.session.noop" not in st:
    raise SystemExit(f"search missed streams.session.noop: {st[:600]}")

ex, _ = post({
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
        "name": "execute",
        "arguments": {
            "operationId": "streams.session.noop",
            "args": {"eventId": "host-pack-smoke"},
        },
    },
}, session=sid)
if "error" in ex:
    raise SystemExit(f"execute rpc error: {ex}")
if (ex.get("result") or {}).get("isError") is True:
    raise SystemExit(f"execute isError: {tool_text(ex)[:800]}")
et = tool_text(ex)
low = et.lower()
if "noop" not in low and '"ok": true' not in et and '"ok":true' not in et.replace(" ", ""):
    raise SystemExit(f"execute streams.session.noop not ok: {et[:800]}")
if re.search(r'"ok"\s*:\s*false', et):
    raise SystemExit(f"execute returned ok:false: {et[:800]}")
print("smoke-host-mcp-pack: PASS")
PY
