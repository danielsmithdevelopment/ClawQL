#!/usr/bin/env bash
# Fair governed density board: same as week1-cf-known-op.sh but Rust runs with
# CLAWQL_DATAPLANE_GOVERNANCE=1 and COMPARISON_LABEL=governance.
# CF known-ops are GET/list only — mandate park is not on the hot path; risk+IFC are.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CF_DP_OUT_DIR="${CF_DP_OUT_DIR:-/opt/cursor/artifacts/dataplane-week1-gov}"
export COMPARISON_LABEL=governance
export CLAWQL_DATAPLANE_GOVERNANCE=1
export CLAWQL_ENABLE_SESSION_IFC="${CLAWQL_ENABLE_SESSION_IFC:-0}"
export CLAWQL_WORM_ENABLED="${CLAWQL_WORM_ENABLED:-0}"

# Reuse week-1 spawn/client by wrapping the dataplane launch env.
# Patch: copy week1 script body with governance flags on Rust.
OUT_DIR="$CF_DP_OUT_DIR"
REPS="${CF_DP_REPS:-3}"
ITERS="${CF_DP_ITERS:-10000}"
LEAN_N="${CF_DP_LEAN_N:-4000}"
SKIP_LEAN="${CF_DP_SKIP_LEAN:-0}"
mkdir -p "$OUT_DIR"
# SQLite pending cannot live on the artifacts FUSE store — use /tmp for CLAWQL_HOME.
RUNTIME_DIR="${CF_DP_RUNTIME_DIR:-/tmp/clawql-dataplane-week1-gov-$$}"
mkdir -p "$RUNTIME_DIR"

SPEC="$ROOT/scripts/dataplane/fixtures/cloudflare-curated-openapi.json"
CATALOG="$ROOT/scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite"
MOCK_JS="$ROOT/scripts/dataplane/mock/cloudflare-replay-mock.mjs"
CLIENT="$ROOT/scripts/dataplane/week1-cf-known-op-client.mjs"
SPAWN_BUN="$ROOT/scripts/dataplane/spawn-bun-lean.mjs"
LEAN_CONFIRM="$ROOT/scripts/dataplane/lean-confirm-bun.mjs"
BUN_HOME="$RUNTIME_DIR/bun-home"
rm -rf "$BUN_HOME"
mkdir -p "$BUN_HOME"

echo "== compile SQLite catalog (shared) =="
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
  sleep 0.3
  for p in "${PIDS[@]:-}"; do
    kill -9 "$p" 2>/dev/null || true
  done
  rm -rf "$RUNTIME_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "== start CF replay mock =="
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

echo "== start Rust dataplane (governance) =="
DP_PORT="$(pick_port)"
DP_HOME="$RUNTIME_DIR/dp-home"
mkdir -p "$DP_HOME"
(cd "$ROOT/crates" && cargo build -p clawql-dataplane --release --quiet)
CLAWQL_HOME="$DP_HOME" \
CLAWQL_PENDING_STORE=sqlite \
CLAWQL_DATAPLANE_GOVERNANCE=1 \
CLAWQL_ENABLE_SESSION_IFC="${CLAWQL_ENABLE_SESSION_IFC}" \
CLAWQL_WORM_ENABLED="${CLAWQL_WORM_ENABLED}" \
CLAWQL_API_BASE_URL="$MOCK_BASE" \
env -u CLAWQL_PENDING_DATABASE_URL \
  "$ROOT/crates/target/release/clawql-dataplane" \
  --bind "127.0.0.1:${DP_PORT}" \
  --catalog "$CATALOG" \
  >"$OUT_DIR/dataplane.log" 2>&1 &
DP_PID=$!
PIDS+=("$DP_PID")
DP_URL="http://127.0.0.1:${DP_PORT}/mcp"

echo "== start Bun host (equal-arm lean) =="
BUN_PORT="$(pick_port)"
SERVER_HTTP="$ROOT/dist/server-http.js"
BUN_META="$OUT_DIR/bun-meta.json"
node "$SPAWN_BUN" \
  --port "$BUN_PORT" \
  --home "$BUN_HOME" \
  --catalog "$CATALOG" \
  --spec "$SPEC" \
  --api-base "$MOCK_BASE" \
  --server "$SERVER_HTTP" \
  --log "$OUT_DIR/bun.log" \
  --out-meta "$BUN_META"
BUN_PID=$(python3 -c "import json; print(json.load(open('$BUN_META'))['pid'])")
PIDS+=("$BUN_PID")
BUN_URL="http://127.0.0.1:${BUN_PORT}/mcp"

for i in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:${DP_PORT}/healthz" >/dev/null; then break; fi
  sleep 0.1
done
for i in $(seq 1 200); do
  if curl -sf "http://127.0.0.1:${BUN_PORT}/healthz" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$BUN_PID" 2>/dev/null; then
    echo "bun exited" >&2
    tail -80 "$OUT_DIR/bun.log" >&2
    exit 1
  fi
  sleep 0.1
done

echo "bun=$BUN_URL dataplane=$DP_URL label=governance"

if [ "$SKIP_LEAN" != "1" ]; then
  echo "== lean-confirm Bun =="
  CLAWQL_TS_MCP_URL="$BUN_URL" \
  CLAWQL_TS_PID="$BUN_PID" \
  CF_DP_LEAN_N="$LEAN_N" \
  CF_DP_LEAN_OUT="$OUT_DIR/lean-confirm.json" \
  CF_DP_LEAN_MAX_MB="${CF_DP_LEAN_MAX_MB:-350}" \
    node "$LEAN_CONFIRM"
fi

echo "== interleaved known-op client (reps=$REPS iters=$ITERS) label=governance =="
COMPARISON_LABEL=governance \
CF_DP_REPS="$REPS" CF_DP_ITERS="$ITERS" \
CLAWQL_TS_MCP_URL="$BUN_URL" \
CLAWQL_DP_MCP_URL="$DP_URL" \
CLAWQL_TS_PID="$BUN_PID" \
CLAWQL_DP_PID="$DP_PID" \
CF_DP_OUT="$OUT_DIR/week1-gov-summary.json" \
  node "$CLIENT"

python3 - <<PY
import json, shutil
p="$OUT_DIR/week1-gov-summary.json"
d=json.load(open(p))
print("comparisonLabel:", d.get("comparisonLabel"), "reps=", d.get("reps"), "iters=", d.get("iters"))
for arm,a in d.get("arms",{}).items():
  pc=a.get("per_call") or {}
  mp=a.get("memory_plateau") or {}
  rg=a.get("ranges") or {}
  print(f"{arm}: errors={a.get('errors')} call_p50={pc.get('p50')} call_p999={pc.get('p999')} plateau_mb={mp.get('median_mb')} ranges_plateau={rg.get('plateau_mb')}")
# publish under docs/benchmarks for the board
pub="$ROOT/docs/benchmarks/gateway-multi-comparison/dataplane-week1-gov-3x10k.json"
shutil.copy(p, pub)
print("published", pub)
PY
