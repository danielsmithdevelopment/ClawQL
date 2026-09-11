#!/usr/bin/env bash
# Full-stack Lab 5b smoke: celld Worker + real clawql-mcp-http + real mcp-api-adapter.
#
# Why not embed full clawql-core / Express adapter in the Worker?
#   celld/Workers cannot run node:fs, Express, gRPC, or stdio hosts. The cell keeps
#   streams-slim in-process and fetch()es the full product as sidecars — this script
#   is that demo.
#
# Requires: celld v0.4.0, esbuild, built repo (dist/ + mcp-api-adapter dist).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../../.." && pwd)"
PORT="${CELLD_DEV_PORT:-9883}"
MCP_PORT="${FULL_STACK_MCP_PORT:-9881}"
ADAPTER_PORT="${FULL_STACK_ADAPTER_PORT:-9882}"
INFER_PORT="${FULL_STACK_INFER_PORT:-9884}"
WORM_PORT="${FULL_STACK_WORM_PORT:-9885}"
WORM_API_KEY="${FULL_STACK_WORM_API_KEY:-streams-celld-smoke-worm-key}"
BASE="http://127.0.0.1:${PORT}"
SMOKE_CFG="$ROOT/wrangler.full-stack.jsonc"
VAULT_DIR="${FULL_STACK_VAULT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/streams-celld-vault.XXXXXX")}"
MCP_LOG="${FULL_STACK_MCP_LOG:-$(mktemp "${TMPDIR:-/tmp}/streams-mcp.XXXXXX.log")}"
ADAPTER_LOG="${FULL_STACK_ADAPTER_LOG:-$(mktemp "${TMPDIR:-/tmp}/streams-adapter.XXXXXX.log")}"

if ! command -v celld >/dev/null 2>&1; then
  if [[ "${STREAMS_CELLD_SMOKE_REQUIRED:-0}" == "1" ]]; then
    echo "full-stack-smoke: FAIL — celld not on PATH (STREAMS_CELLD_SMOKE_REQUIRED=1)" >&2
    exit 1
  fi
  echo "full-stack-smoke: celld not on PATH — skip" >&2
  exit 0
fi

if [[ ! -f "$REPO/dist/server-http.js" ]]; then
  echo "full-stack-smoke: FAIL — missing $REPO/dist/server-http.js (run npm run build)" >&2
  exit 1
fi
if [[ ! -f "$REPO/packages/mcp-api-adapter/dist/cli.js" ]]; then
  echo "full-stack-smoke: FAIL — build mcp-api-adapter first (npm run build -w mcp-api-adapter)" >&2
  exit 1
fi

mkdir -p "$VAULT_DIR"
node "$ROOT/scripts/bundle-check.mjs"
node "$ROOT/scripts/mcp-fetch.test.mjs"
node "$ROOT/scripts/adapter-fetch.test.mjs"
node "$ROOT/scripts/worm-fetch.test.mjs"

# Real clawql-mcp (empty OpenAPI catalog is fine — skills + memory still register).
# Process WORM (clawql-audit) exposes HTTP /entries for the cell dual-write.
(
  cd "$REPO"
  export PORT="$MCP_PORT"
  export MCP_PATH=/mcp
  export CLAWQL_ALLOW_NO_ENFORCEMENT=1
  export CLAWQL_ENABLE_MEMORY=1
  export CLAWQL_OBSIDIAN_VAULT_PATH="$VAULT_DIR"
  export CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1
  # Cells have no session affinity — use clawql-mcp's 2026-07-28-compatible
  # stateless path while the thin client speaks SDK-supported 2025-11-25.
  export CLAWQL_MCP_STATELESS=1
  export CLAWQL_WORM_ENABLED=1
  export CLAWQL_WORM_LOCAL=memory
  export CLAWQL_WORM_REMOTE=memory
  export CLAWQL_WORM_RECONCILE_MS=0
  export CLAWQL_WORM_HTTP_PORT="$WORM_PORT"
  export CLAWQL_AUDIT_API_KEY="$WORM_API_KEY"
  export CLAWQL_WORM_DEBUG=1
  # Prefer empty catalog unless the operator set a pack.
  export CLAWQL_PROVIDER="${CLAWQL_PROVIDER:-}"
  unset CLAWQL_BUNDLED_PROVIDERS || true
  exec node bin/clawql-mcp-http.mjs
) >"$MCP_LOG" 2>&1 &
MCP_PID=$!

# Inference health stub (completions remain out of scope for this smoke).
node "$ROOT/scripts/inference-health-stub.mjs" "$INFER_PORT" >/dev/null 2>&1 &
INFER_PID=$!

wait_http() {
  local url="$1" name="$2" pid="$3" tries="${4:-60}"
  for _ in $(seq 1 "$tries"); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "full-stack-smoke: FAIL — $name exited before ready ($url)" >&2
      return 1
    fi
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "full-stack-smoke: FAIL — $name never ready at $url" >&2
  return 1
}

cleanup() {
  local pids=("$CELLD_PID" "$ADAPTER_PID" "$MCP_PID" "$INFER_PID")
  for p in "${pids[@]}"; do
    [[ -n "${p:-}" ]] || continue
    kill "$p" 2>/dev/null || true
  done
  # celld can ignore SIGTERM briefly — escalate so CI does not hang on EXIT.
  sleep 1
  for p in "${pids[@]}"; do
    [[ -n "${p:-}" ]] || continue
    kill -9 "$p" 2>/dev/null || true
  done
  rm -f "$SMOKE_CFG"
  if [[ "${FULL_STACK_KEEP_VAULT:-0}" != "1" ]]; then
    rm -rf "$VAULT_DIR"
  fi
}
trap cleanup EXIT

wait_http "http://127.0.0.1:${MCP_PORT}/healthz" "clawql-mcp-http" "$MCP_PID" 80

# Host clawql-audit HTTP must be up before cell spawn (SESSION_START dual-write).
worm_ready=0
for _ in $(seq 1 80); do
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    echo "full-stack-smoke: FAIL — clawql-mcp exited before WORM HTTP ready" >&2
    tail -40 "$MCP_LOG" >&2 || true
    exit 1
  fi
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: ApiKey ${WORM_API_KEY}" \
    "http://127.0.0.1:${WORM_PORT}/entries" || true)
  if [[ "$code" == "200" ]]; then
    worm_ready=1
    break
  fi
  sleep 0.5
done
if [[ "$worm_ready" != "1" ]]; then
  echo "full-stack-smoke: FAIL — clawql-audit HTTP never ready on :${WORM_PORT}" >&2
  tail -50 "$MCP_LOG" >&2 || true
  exit 1
fi

# Seed a prior tip on the *same* host WORM singleton the cell will append to.
# Continuity assertion: SESSION_START.prevHash must equal this tip's hash
# (proves tip-extend via create()/loadTip — not a fresh disconnected genesis chain).
SEED_JSON=$(curl -sf -X POST "http://127.0.0.1:${WORM_PORT}/entries" \
  -H "Authorization: ApiKey ${WORM_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"type\":\"AGENT_ACTION\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"sessionId\":\"full-stack-seed-tip\",\"agentName\":\"full-stack-smoke\",\"metadata\":{\"kind\":\"tip_seed\"}}")
TIP_HASH=$(echo "$SEED_JSON" | python3 -c 'import json,sys; e=json.load(sys.stdin); print(e["hash"]); assert "chainIndex" in e')
TIP_INDEX=$(echo "$SEED_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["chainIndex"])')
echo "full-stack-smoke: seeded host tip chainIndex=${TIP_INDEX} hash=${TIP_HASH:0:16}…"

# Real mcp-api-adapter wrapping that MCP (REST + OpenAPI; skip gRPC/UI for speed).
(
  cd "$REPO"
  exec node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs \
    --mcp-url "http://127.0.0.1:${MCP_PORT}/mcp" \
    --listen "127.0.0.1:${ADAPTER_PORT}" \
    --no-grpc \
    --no-mcp-ui \
    --title "streams-celld-full-stack"
) >"$ADAPTER_LOG" 2>&1 &
ADAPTER_PID=$!

# Adapter readiness: OpenAPI appears after ListTools against MCP.
ready_adapter=0
for _ in $(seq 1 80); do
  if ! kill -0 "$ADAPTER_PID" 2>/dev/null; then
    echo "full-stack-smoke: FAIL — mcp-api-adapter exited early" >&2
    echo "--- adapter log ---" >&2
    tail -40 "$ADAPTER_LOG" >&2 || true
    exit 1
  fi
  if curl -sf "http://127.0.0.1:${ADAPTER_PORT}/openapi.json" >/dev/null 2>&1; then
    ready_adapter=1
    break
  fi
  sleep 0.5
done
if [[ "$ready_adapter" != "1" ]]; then
  echo "full-stack-smoke: FAIL — adapter OpenAPI never ready" >&2
  tail -40 "$ADAPTER_LOG" >&2 || true
  exit 1
fi

python3 - "$ROOT/wrangler.jsonc" "$SMOKE_CFG" "$MCP_PORT" "$ADAPTER_PORT" "$INFER_PORT" "$WORM_PORT" "$WORM_API_KEY" <<'PY'
import json, re, sys
src, dst, mcp_port, adapter_port, infer_port, worm_port, worm_key = sys.argv[1:8]
text = open(src, encoding="utf-8").read()
text = re.sub(r"/\*[\s\S]*?\*/", "", text)
text = re.sub(r"^\s*//.*$", "", text, flags=re.M)
cfg = json.loads(text)
cfg.setdefault("vars", {})
cfg["vars"]["CLAWQL_MCP_URL"] = f"http://127.0.0.1:{mcp_port}/mcp"
cfg["vars"]["CLAWQL_MCP_ADAPTER_URL"] = f"http://127.0.0.1:{adapter_port}"
cfg["vars"]["INFERENCE_URL"] = f"http://127.0.0.1:{infer_port}"
cfg["vars"]["CLAWQL_AUDIT_WORM_URL"] = f"http://127.0.0.1:{worm_port}"
cfg["vars"]["CLAWQL_AUDIT_API_KEY"] = worm_key
open(dst, "w", encoding="utf-8").write(json.dumps(cfg, indent=2) + "\n")
PY

cd "$ROOT"
# Fresh DO SQLite avoids stale spawn_count / NodeFenced leftovers across smokes.
rm -rf "$ROOT/.celld/dev"
# Config must live under the project (celld resolves worker entry relative to it).
celld dev "$SMOKE_CFG" --port "$PORT" &
CELLD_PID=$!

wait_http "$BASE/health" "celld" "$CELLD_PID" 80
# Settle after first build so a watcher rebuild does not fence the webhook.
sleep 1
curl -sf "$BASE/health" | grep -q clawql-streams-celld-skeleton

EVENT_ID="full-stack-$(date +%s)-$$"
RESP=$(curl -sf -X POST "$BASE/webhook/full-stack" \
  -H 'content-type: application/json' \
  -H "x-clawql-event-id: ${EVENT_ID}" \
  -d '{"probe":true,"mode":"full-stack"}')

fail() {
  echo "full-stack-smoke: FAIL - $1" >&2
  echo "$RESP" >&2
  echo "--- mcp log (tail) ---" >&2
  tail -30 "$MCP_LOG" >&2 || true
  echo "--- adapter log (tail) ---" >&2
  tail -30 "$ADAPTER_LOG" >&2 || true
  exit 1
}

echo "$RESP" | grep -q '"action":"spawn"' || fail "expected action spawn"
echo "$RESP" | grep -q 'clawql-core/streams-slim' || fail "expected clawql-core/streams-slim"
echo "$RESP" | grep -q '"hash":' || fail "expected hash-chained audit append"
echo "$RESP" | grep -q 'streams:session:' || fail "expected cache session key"
echo "$RESP" | grep -q 'streamable-http' || fail "expected MCP streamable-http transport"
echo "$RESP" | grep -q '"mcpUrlConfigured":true' || fail "expected mcpUrlConfigured true"
echo "$RESP" | grep -q '"adapterUrlConfigured":true' || fail "expected adapterUrlConfigured true"
echo "$RESP" | grep -q 'mcp-api-adapter-rest' || fail "expected adapter REST transport"
echo "$RESP" | grep -q '"snapshotKey":"audit:ring"' || fail "expected audit LTX snapshotKey"
echo "$RESP" | grep -q 'audit:seq:' || fail "expected audit:seq WORM keys"
echo "$RESP" | grep -q '"durable"' || fail "expected core.durable surfaces"

# Must be real hosts — not Lab mocks.
echo "$RESP" | grep -q '"source":"mock-mcp"' && fail "unexpected mock-mcp (expected real clawql-mcp)"
echo "$RESP" | grep -q '"source":"mock-adapter"' && fail "unexpected mock-adapter (expected real mcp-api-adapter)"

# Real MCP search / memory + host clawql-audit SESSION_START (not just cell ring).
echo "$RESP" | python3 -c '
import json,sys,urllib.request
r=json.load(sys.stdin)
body=r.get("session") if isinstance(r.get("session"), dict) and "tools" in (r.get("session") or {}) else r
tools=body.get("tools") or {}
search=tools.get("search") or {}
if search.get("ok") is not True:
  raise SystemExit(f"search not ok: {search!r}"[:800])
mi=tools.get("memory_ingest") or {}
if mi.get("ok") is not True:
  raise SystemExit(f"memory_ingest not ok: {mi!r}"[:800])
mr=tools.get("memory_recall") or {}
if mr.get("ok") is not True:
  raise SystemExit(f"memory_recall not ok: {mr!r}"[:800])
ad=tools.get("adapter_search") or {}
if ad.get("ok") is not True:
  raise SystemExit(f"adapter_search not ok: {ad!r}"[:800])
inf=body.get("inference") or {}
if inf.get("ok") is not True:
  raise SystemExit(f"inference health probe not ok: {inf!r}"[:400])
ex=tools.get("execute") or {}
if ex.get("deferred") is True or ex.get("transport") != "streamable-http":
  raise SystemExit(f"execute did not hit streamable-http: {ex!r}"[:800])
cw=(body.get("audit") or {}).get("compliance") or {}
if cw.get("ok") is not True:
  raise SystemExit(f"compliance WORM SESSION_START not ok: {cw!r}"[:800])
if cw.get("transport") != "clawql-audit-http":
  raise SystemExit(f"compliance WORM wrong transport: {cw!r}"[:400])
core=body.get("core") or {}
if core.get("wormUrlConfigured") is not True:
  raise SystemExit("wormUrlConfigured expected true")
event_id=r.get("eventId") or (body.get("session") or {}).get("eventId")
print("full-stack assertions: search/memory/adapter/inference/compliance-WORM OK")
print(f"event_id={event_id}")
' || fail "python assertions failed"

EVENT_ID=$(echo "$RESP" | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r.get("eventId") or "")')
WORM_JSON=$(curl -sf -H "Authorization: ApiKey ${WORM_API_KEY}" \
  "http://127.0.0.1:${WORM_PORT}/entries?sessionId=${EVENT_ID}")
echo "$WORM_JSON" | TIP_HASH="$TIP_HASH" TIP_INDEX="$TIP_INDEX" python3 -c '
import json,os,sys
data=json.load(sys.stdin)
tip_hash=os.environ["TIP_HASH"]
tip_index=int(os.environ["TIP_INDEX"])
entries=data.get("entries") or []
starts=[e for e in entries if e.get("type")=="SESSION_START"]
if not starts:
  raise SystemExit(("no SESSION_START in host clawql-audit for session: %r" % (data,))[:800])
e=starts[-1]
if "hash" not in e or "chainIndex" not in e or "prevHash" not in e:
  raise SystemExit(("SESSION_START missing chain fields: %r" % (e,))[:800])
# Exact continuity: cell dual-write must extend the pre-seeded host tip, not genesis.
if e.get("prevHash") != tip_hash:
  raise SystemExit(
    "SESSION_START prevHash discontinuity: got %r expected tip %r (fork / fresh chain, not tip-extend)"
    % (e.get("prevHash"), tip_hash)
  )
expected_index = tip_index + 1
if e.get("chainIndex") != expected_index:
  raise SystemExit(
    "SESSION_START chainIndex=%s expected %s (tip was %s)"
    % (e.get("chainIndex"), expected_index, tip_index)
  )
print(
  "host WORM verify: SESSION_START extends tip chainIndex=%s prevHash=%s… hash=%s…"
  % (e.get("chainIndex"), str(e.get("prevHash"))[:16], str(e.get("hash"))[:16])
)
' || fail "host clawql-audit continuity assertion failed"

VERIFY=$(curl -sf -H "Authorization: ApiKey ${WORM_API_KEY}" \
  "http://127.0.0.1:${WORM_PORT}/chain/verify")
echo "$VERIFY" | python3 -c '
import json,sys
v=json.load(sys.stdin)
if v.get("valid") is not True:
  raise SystemExit(f"full-chain /chain/verify failed: {v!r}"[:800])
checked=v.get("entriesChecked")
if not isinstance(checked, int) or checked < 2:
  raise SystemExit(f"expected full chain entriesChecked>=2 got {v!r}"[:400])
print("host WORM chain/verify: valid entriesChecked=%s" % checked)
' || fail "chain/verify failed"

echo "full-stack-smoke: PASS"
echo "full-stack-smoke: vault=$VAULT_DIR mcp_log=$MCP_LOG adapter_log=$ADAPTER_LOG"
