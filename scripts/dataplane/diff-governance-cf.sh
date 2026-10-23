#!/usr/bin/env bash
# Spawn CF mock + Bun lean host + Rust dataplane (governance=1) and cross-diff decisions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${CF_DP_OUT_DIR:-/opt/cursor/artifacts/dataplane-gov-diff}"
mkdir -p "$OUT_DIR"
# SQLite pending/WORM cannot live on the artifacts FUSE store (disk I/O error).
# Keep logs/JSON under OUT_DIR; put CLAWQL_HOME on a real filesystem.
RUNTIME_DIR="${CF_DP_RUNTIME_DIR:-/tmp/clawql-dataplane-gov-diff-$$}"
mkdir -p "$RUNTIME_DIR"
cleanup_runtime() { rm -rf "$RUNTIME_DIR" 2>/dev/null || true; }

SPEC="$ROOT/scripts/dataplane/fixtures/cloudflare-curated-openapi.json"
CATALOG="$ROOT/scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite"
MOCK_JS="$ROOT/scripts/dataplane/mock/cloudflare-replay-mock.mjs"
SPAWN_BUN="$ROOT/scripts/dataplane/spawn-bun-lean.mjs"
SERVER_HTTP="$ROOT/dist/server-http.js"

if [ ! -f "$SERVER_HTTP" ]; then
  echo "missing $SERVER_HTTP — run root build first" >&2
  exit 1
fi

node "$ROOT/scripts/dataplane/compile-catalog-sqlite.mjs" --spec "$SPEC" --out "$CATALOG"

pick_port() {
  python3 - <<'PY'
import socket
s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()
PY
}

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do
    kill "$p" 2>/dev/null || true
  done
  sleep 0.2
  for p in "${PIDS[@]:-}"; do
    kill -9 "$p" 2>/dev/null || true
  done
  cleanup_runtime
}
trap cleanup EXIT

echo "== CF replay mock =="
MOCK_PORT="$(pick_port)"
MT_MOCK_PORT="$MOCK_PORT" FIXTURE="$ROOT/scripts/dataplane/fixtures/recording.synthetic.json" \
  MT_UPSTREAM_LATENCY=0 node "$MOCK_JS" >"$OUT_DIR/mock.log" 2>&1 &
PIDS+=($!)
for i in $(seq 1 80); do
  if grep -q '"ready":true' "$OUT_DIR/mock.log" 2>/dev/null; then break; fi
  sleep 0.1
done
MOCK_BASE=$(python3 - <<PY
import json, re
t = open("$OUT_DIR/mock.log").read()
m = re.search(r"\{[^\n]*\}", t)
print(json.loads(m.group())["baseUrl"] if m else "")
PY
)
echo "mock=$MOCK_BASE"

BUN_HOME="$RUNTIME_DIR/bun-home"
rm -rf "$BUN_HOME"
mkdir -p "$BUN_HOME"

echo "== Bun lean host (risk enforce default on) =="
BUN_PORT="$(pick_port)"
node "$SPAWN_BUN" \
  --port "$BUN_PORT" \
  --home "$BUN_HOME" \
  --catalog "$CATALOG" \
  --spec "$SPEC" \
  --api-base "$MOCK_BASE" \
  --server "$SERVER_HTTP" \
  --log "$OUT_DIR/bun.log" \
  --out-meta "$OUT_DIR/bun-meta.json"
BUN_PID=$(python3 -c "import json; print(json.load(open('$OUT_DIR/bun-meta.json'))['pid'])")
PIDS+=("$BUN_PID")

echo "== Rust dataplane governance=1 =="
(cd "$ROOT/crates" && cargo build -p clawql-dataplane --release --quiet)
DP_PORT="$(pick_port)"
DP_HOME="$RUNTIME_DIR/dp-home"
mkdir -p "$DP_HOME"
# Force SQLite pending for the local board (avoid inherited CLAWQL_PENDING_DATABASE_URL).
CLAWQL_HOME="$DP_HOME" \
CLAWQL_PENDING_STORE=sqlite \
CLAWQL_DATAPLANE_GOVERNANCE=1 \
CLAWQL_ENABLE_SESSION_IFC=0 \
CLAWQL_WORM_ENABLED=0 \
CLAWQL_API_BASE_URL="$MOCK_BASE" \
env -u CLAWQL_PENDING_DATABASE_URL \
  "$ROOT/crates/target/release/clawql-dataplane" \
  --bind "127.0.0.1:${DP_PORT}" \
  --catalog "$CATALOG" \
  >"$OUT_DIR/dataplane.log" 2>&1 &
DP_PID=$!
PIDS+=("$DP_PID")

for i in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:${DP_PORT}/healthz" >/dev/null; then break; fi
  if ! kill -0 "$DP_PID" 2>/dev/null; then
    echo "dataplane exited" >&2
    cat "$OUT_DIR/dataplane.log" >&2
    exit 1
  fi
  sleep 0.1
  if [ "$i" -eq 100 ]; then
    echo "dataplane not healthy" >&2
    cat "$OUT_DIR/dataplane.log" >&2
    exit 1
  fi
done
for i in $(seq 1 200); do
  if curl -sf "http://127.0.0.1:${BUN_PORT}/healthz" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$BUN_PID" 2>/dev/null; then
    echo "bun exited" >&2
    tail -80 "$OUT_DIR/bun.log" >&2
    exit 1
  fi
  sleep 0.1
  if [ "$i" -eq 200 ]; then
    echo "bun not healthy" >&2
    tail -80 "$OUT_DIR/bun.log" >&2
    exit 1
  fi
done

export CLAWQL_TS_MCP_URL="http://127.0.0.1:${BUN_PORT}"
export CLAWQL_DP_MCP_URL="http://127.0.0.1:${DP_PORT}"
echo "bun=$CLAWQL_TS_MCP_URL rust=$CLAWQL_DP_MCP_URL"

node "$ROOT/scripts/dataplane/diff-governance-cf.mjs" | tee "$OUT_DIR/diff-governance-cf.json"
