#!/usr/bin/env bash
# Week-1 signal: Cloudflare curated known-ops through Bun host + Rust dataplane,
# interleaved. BOTH sides share the same SQLite catalog + CF replay mock.
#
# Bun spawn matches heap-vs-anon-plateau (published ~130 MB anon). A lean-confirm
# probe (single DNS known-op × N) must pass before the 10k session run.
#
# Label: fast-path-only — Rust Phase A has no governance. Not a go/no-go bar.
#
# Defaults match other boards: CF_DP_REPS=3 CF_DP_ITERS=10000
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${CF_DP_OUT_DIR:-/opt/cursor/artifacts/dataplane-week1}"
REPS="${CF_DP_REPS:-3}"
ITERS="${CF_DP_ITERS:-10000}"
LEAN_N="${CF_DP_LEAN_N:-4000}"
SKIP_LEAN="${CF_DP_SKIP_LEAN:-0}"
mkdir -p "$OUT_DIR"

SPEC="$ROOT/scripts/dataplane/fixtures/cloudflare-curated-openapi.json"
CATALOG="$ROOT/scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite"
MOCK_JS="$ROOT/scripts/dataplane/mock/cloudflare-replay-mock.mjs"
CLIENT="$ROOT/scripts/dataplane/week1-cf-known-op-client.mjs"
SPAWN_BUN="$ROOT/scripts/dataplane/spawn-bun-lean.mjs"
LEAN_CONFIRM="$ROOT/scripts/dataplane/lean-confirm-bun.mjs"
BUN_HOME="$OUT_DIR/bun-home"
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
if [ -z "$MOCK_BASE" ]; then
  echo "mock failed to start" >&2
  cat "$OUT_DIR/mock.log" >&2
  exit 1
fi
echo "mock=$MOCK_BASE"

echo "== start Rust dataplane (fast-path-only) =="
DP_PORT="$(pick_port)"
(cd "$ROOT/crates" && cargo build -p clawql-dataplane --release --quiet)
CLAWQL_API_BASE_URL="$MOCK_BASE" \
  "$ROOT/crates/target/release/clawql-dataplane" \
  --bind "127.0.0.1:${DP_PORT}" \
  --catalog "$CATALOG" \
  >"$OUT_DIR/dataplane.log" 2>&1 &
PIDS+=($!)
DP_PID="${PIDS[-1]}"
DP_URL="http://127.0.0.1:${DP_PORT}/mcp"

echo "== start Bun host (heap-vs-anon equal-arm lean + LOAD=db) =="
BUN_PORT="$(pick_port)"
SERVER_HTTP="$ROOT/dist/server-http.js"
if [ ! -f "$SERVER_HTTP" ]; then
  echo "missing $SERVER_HTTP — run root build first" >&2
  exit 1
fi

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
  if [ "$i" -eq 100 ]; then echo "dataplane not healthy" >&2; cat "$OUT_DIR/dataplane.log" >&2; exit 1; fi
done

for i in $(seq 1 200); do
  if grep -q 'listening on' "$OUT_DIR/bun.log" 2>/dev/null; then
    if curl -sf "http://127.0.0.1:${BUN_PORT}/healthz" >/dev/null 2>&1; then break; fi
  fi
  if ! kill -0 "$BUN_PID" 2>/dev/null; then
    echo "bun exited" >&2
    cat "$OUT_DIR/bun.log" >&2
    exit 1
  fi
  sleep 0.1
  if [ "$i" -eq 200 ]; then echo "bun not healthy" >&2; tail -80 "$OUT_DIR/bun.log" >&2; exit 1; fi
done

echo "bun=$BUN_URL pid=$BUN_PID"
echo "dataplane=$DP_URL pid=$DP_PID"
rg -n "catalog-sqlite|Ready|graphql|listening" "$OUT_DIR/bun.log" | head -20 || true

if [ "$SKIP_LEAN" != "1" ]; then
  echo "== lean-confirm Bun (single DNS known-op × ${LEAN_N}, expect ~130 MB) =="
  CLAWQL_TS_MCP_URL="$BUN_URL" \
  CLAWQL_TS_PID="$BUN_PID" \
  CF_DP_LEAN_N="$LEAN_N" \
  CF_DP_LEAN_OUT="$OUT_DIR/lean-confirm.json" \
  CF_DP_LEAN_MAX_MB="${CF_DP_LEAN_MAX_MB:-350}" \
    node "$LEAN_CONFIRM"
fi

echo "== interleaved known-op client (reps=$REPS iters=$ITERS) label=fast-path-only =="
COMPARISON_LABEL=fast-path-only \
CF_DP_REPS="$REPS" CF_DP_ITERS="$ITERS" \
CLAWQL_TS_MCP_URL="$BUN_URL" \
CLAWQL_DP_MCP_URL="$DP_URL" \
CLAWQL_TS_PID="$BUN_PID" \
CLAWQL_DP_PID="$DP_PID" \
CF_DP_OUT="$OUT_DIR/week1-summary.json" \
  node "$CLIENT"

echo "week-1 summary: $OUT_DIR/week1-summary.json"
python3 - <<PY
import json
p="$OUT_DIR/week1-summary.json"
d=json.load(open(p))
print("comparisonLabel:", d.get("comparisonLabel"))
for arm,a in d.get("arms",{}).items():
  pc=a.get("per_call") or {}
  ps=a.get("per_session") or {}
  mp=a.get("memory_plateau") or {}
  print(f"{arm}: errors={a.get('errors')} call_p99={pc.get('p99')} call_p999={pc.get('p999')} sess_p99={ps.get('p99')} sess_p999={ps.get('p999')} plateau_mb={mp.get('median_mb')}")
PY
