#!/usr/bin/env bash
# Protocol Fabric loop smoke:
#   WS → adapter → clawql execute(CLI source) → gen-cli → POST /memory_ingest → vault
#
# Usage (from repo root):
#   scripts/dev/smoke-protocol-fabric-loop.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

HOME_DIR="${FABRIC_HOME:-$(mktemp -d /tmp/clawql-fabric-XXXXXX)}"
CLAW_PORT="${CLAW_PORT:-18080}"
ADAPTER_PORT="${ADAPTER_PORT:-18090}"
MARKER="FABRIC_LOOP_$(date +%s)"
CLI_OP="cli__fabric_event__run"

cleanup() {
  stop_pid "${ADAPTER_PID:-}"
  stop_pid "${CLAW_PID:-}"
}
trap cleanup EXIT

CLAW_PID=""
ADAPTER_PID=""

# stop_pid/wait_http defined above — ensure CLAW_PID vars exist before first start
:

wait_http() {
  local url="$1"
  local attempt=0
  while [ "$attempt" -lt 90 ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.5
  done
  echo "FAIL: timeout waiting for $url" >&2
  return 1
}

wait_port_free() {
  local port="$1"
  local attempt=0
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
  while [ "$attempt" -lt 40 ]; do
    if ! curl -sf --max-time 0.2 "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.25
  done
  echo "WARN: port $port still answering /healthz" >&2
}

stop_pid() {
  local pid="$1"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    kill -9 "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

echo "== build adapter + clawql-api =="
npm run build -w mcp-grpc-transport >/dev/null
npm run build -w mcp-api-adapter >/dev/null
# Ensure custom-source merge fix is on disk for clawql-mcp
npm run build -w clawql-api >/dev/null

# Clear any leftover listeners from prior smokes
fuser -k "${CLAW_PORT}/tcp" 2>/dev/null || true
fuser -k "${ADAPTER_PORT}/tcp" 2>/dev/null || true
sleep 1

mkdir -p "$HOME_DIR/Memory" "$HOME_DIR/fabric-cli"
export CLAWQL_HOME="$HOME_DIR"
export CLAWQL_ENABLE_MEMORY=1
export CLAWQL_ENABLE_PAGEINDEX=0
export CLAWQL_ENABLE_ONYX=0
export CLAWQL_ENABLE_SANDBOX=0
export CLAWQL_ENABLE_SCHEDULE=0
export CLAWQL_ENABLE_NOTIFY=0
export CLAWQL_ENABLE_OUROBOROS=0
export CLAWQL_ENABLE_CODEGRAPH=0
export CLAWQL_PANGUARD_IN_PROCESS=0
export PORT="$CLAW_PORT"
# Prefer a lean HTTP MCP for the smoke
export CLAWQL_MCP_STATELESS=1

start_claw() {
  echo "== clawql-mcp-http on :$CLAW_PORT (CLAWQL_HOME=$HOME_DIR) =="
  wait_port_free "$CLAW_PORT"
  node bin/clawql-mcp-http.mjs >/tmp/clawql-fabric-claw.log 2>&1 &
  CLAW_PID=$!
  if ! wait_http "http://127.0.0.1:${CLAW_PORT}/healthz"; then
    echo "---- claw log ----" >&2
    tail -100 /tmp/clawql-fabric-claw.log >&2 || true
    exit 1
  fi
}

start_adapter() {
  echo "== mcp-api-adapter on :$ADAPTER_PORT =="
  wait_port_free "$ADAPTER_PORT"
  node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs \
    --mcp-url "http://127.0.0.1:${CLAW_PORT}/mcp" \
    --listen "127.0.0.1:${ADAPTER_PORT}" \
    --grpc-listen "127.0.0.1:0" \
    --title "Protocol Fabric loop" \
    >/tmp/clawql-fabric-adapter.log 2>&1 &
  ADAPTER_PID=$!
  if ! wait_http "http://127.0.0.1:${ADAPTER_PORT}/healthz"; then
    echo "---- adapter log ----" >&2
    tail -80 /tmp/clawql-fabric-adapter.log >&2 || true
    exit 1
  fi
  curl -sf "http://127.0.0.1:${ADAPTER_PORT}/healthz" | tee /tmp/clawql-fabric-health.json
  echo
  python3 - <<'PY'
import json
h=json.load(open("/tmp/clawql-fabric-health.json"))
assert "websocket" in h.get("surfaces", []), h
print("surfaces ok:", h["surfaces"])
PY
}

start_claw
start_adapter

echo "== gen-cli from adapter catalog =="
node packages/mcp-api-adapter/bin/mcp-api-adapter.mjs gen-cli \
  --out "$HOME_DIR/fabric-cli" \
  --name fabric-tools \
  --base-url "http://127.0.0.1:${ADAPTER_PORT}" \
  --mcp-url "http://127.0.0.1:${ADAPTER_PORT}/mcp"

test -f "$HOME_DIR/fabric-cli/bin/fabric-tools.mjs"

echo "== register CLI custom source (memory_ingest via gen-cli) =="
python3 - <<PY
import json
from pathlib import Path
home = Path("$HOME_DIR")
cli = str(home / "fabric-cli" / "bin" / "fabric-tools.mjs")
doc = {
  "version": 1,
  "sources": [
    {
      "id": "fabric-event",
      "kind": "cli",
      "name": "Fabric event → memory_ingest",
      "addedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
      "cliCommand": "node",
      "cliArgs": [cli, "memory_ingest"],
      "cliDescription": "Protocol Fabric loop: gen-cli POSTs memory_ingest through the adapter",
    }
  ],
}
(home / "sources.json").write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
print("wrote", home / "sources.json")
PY

echo "== restart clawql to index CLI source =="
stop_pid "$ADAPTER_PID"
ADAPTER_PID=""
stop_pid "$CLAW_PID"
CLAW_PID=""
wait_port_free "$CLAW_PORT"
wait_port_free "$ADAPTER_PORT"
start_claw
start_adapter

# Confirm CLI op is searchable
curl -sf -X POST "http://127.0.0.1:${ADAPTER_PORT}/search" \
  -H 'content-type: application/json' \
  -d '{"query":"cli__fabric_event__run","limit":20}' | tee /tmp/clawql-fabric-search.json | head -c 1200
echo
python3 - <<'PY'
import json
raw=open("/tmp/clawql-fabric-search.json").read()
assert "cli__fabric_event__run" in raw, raw[:800]
print("CLI op indexed")
PY

# Direct execute probe (dry path through CLI → gen-cli → memory_ingest)
PROBE_ARGS=$(python3 - <<PY
import json
print(json.dumps({
  "operationId": "cli__fabric_event__run",
  "args": {
    "args": ["--args", json.dumps({
      "title": "Fabric probe ${MARKER}",
      "insights": "probe marker ${MARKER}",
      "tags": ["fabric-loop","probe"],
      "append": True,
      "correlationId": "${MARKER}-probe",
    })]
  }
}))
PY
)
curl -sf -X POST "http://127.0.0.1:${ADAPTER_PORT}/execute" \
  -H 'content-type: application/json' \
  -d "$PROBE_ARGS" | tee /tmp/clawql-fabric-probe.json | head -c 800
echo
python3 - <<'PY'
import json
d=json.load(open("/tmp/clawql-fabric-probe.json"))
text=json.dumps(d)
assert "exitCode" in text or "error" not in text.lower() or '"exitCode":0' in text.replace(" ",""), text[:600]
print("REST execute probe ok")
PY

echo "== WS dispatch ×2 execute(cli__fabric_event__run) =="
node --input-type=module - <<NODE
import WebSocket from "ws";

const wsUrl = "ws://127.0.0.1:${ADAPTER_PORT}/ws";
const op = "${CLI_OP}";
const marker = "${MARKER}";

function onceReady(ws) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ready timeout")), 10000);
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === "ready") {
          clearTimeout(t);
          resolve(msg);
        }
      } catch { /* ignore */ }
    });
    ws.on("error", reject);
  });
}

function call(ws, id, tool, args) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("call timeout " + id)), 60000);
    const onMsg = (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.id !== id) return;
        clearTimeout(t);
        ws.off("message", onMsg);
        resolve(msg);
      } catch (e) {
        clearTimeout(t);
        reject(e);
      }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id, tool, arguments: args }));
  });
}

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.once("open", res);
  ws.once("error", rej);
});
await onceReady(ws);

for (const n of [1, 2]) {
  const title = \`Fabric loop \${marker}-\${n}\`;
  const insights = \`marker \${marker} event=\${n}\`;
  const ingestArgs = JSON.stringify({
    title,
    insights,
    tags: ["fabric-loop", "smoke"],
    append: true,
    correlationId: \`\${marker}-\${n}\`,
  });
  const resp = await call(ws, \`evt-\${n}\`, "execute", {
    operationId: op,
    args: { args: ["--args", ingestArgs] },
  });
  console.log(JSON.stringify(resp, null, 2));
  if (!resp.ok) {
    console.error("FAIL: WS execute not ok", resp);
    process.exit(1);
  }
}

ws.close();
console.log("WS execute hops ok");
NODE

echo "== verify via REST memory_recall =="
RECALL="$(curl -sf -X POST "http://127.0.0.1:${ADAPTER_PORT}/memory_recall" \
  -H 'content-type: application/json' \
  -d "{\"query\":\"${MARKER}\",\"limit\":5}")"
echo "$RECALL" | head -c 1200
echo
echo "$RECALL" | grep -q "$MARKER" || {
  echo "FAIL: marker $MARKER not found in memory_recall" >&2
  exit 1
}

echo "OK protocol fabric loop (HOME=$HOME_DIR marker=$MARKER)"
