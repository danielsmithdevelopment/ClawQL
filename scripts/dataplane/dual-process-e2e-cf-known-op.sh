#!/usr/bin/env bash
# Dual-process e2e density board: Bun-only vs Bun→Rust forward.
# Memory for dual_process = Bun Anonymous + dataplane Anonymous.
# Latency = client wall-clock through the Bun MCP URL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${CF_DP_OUT_DIR:-/opt/cursor/artifacts/dataplane-dual-process-e2e}"
REPS="${CF_DP_REPS:-3}"
ITERS="${CF_DP_ITERS:-10000}"
mkdir -p "$OUT_DIR"
RUNTIME_DIR="${CF_DP_RUNTIME_DIR:-/tmp/clawql-dataplane-dual-e2e-$$}"
mkdir -p "$RUNTIME_DIR"

SPEC="$ROOT/scripts/dataplane/fixtures/cloudflare-curated-openapi.json"
CATALOG="$ROOT/scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite"
MOCK_JS="$ROOT/scripts/dataplane/mock/cloudflare-replay-mock.mjs"
CLIENT="$ROOT/scripts/dataplane/dual-process-e2e-client.mjs"
SPAWN_BUN="$ROOT/scripts/dataplane/spawn-bun-lean.mjs"
SERVER_HTTP="$ROOT/dist/server-http.js"

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
DP_URL="http://127.0.0.1:${DP_PORT}/mcp"

for i in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:${DP_PORT}/healthz" >/dev/null; then break; fi
  sleep 0.1
done

echo "== start Bun host (single-process, no forward) =="
BUN_PORT="$(pick_port)"
BUN_HOME="$RUNTIME_DIR/bun-solo"
mkdir -p "$BUN_HOME"
BUN_META="$OUT_DIR/bun-solo-meta.json"
node "$SPAWN_BUN" \
  --port "$BUN_PORT" \
  --home "$BUN_HOME" \
  --catalog "$CATALOG" \
  --spec "$SPEC" \
  --api-base "$MOCK_BASE" \
  --server "$SERVER_HTTP" \
  --log "$OUT_DIR/bun-solo.log" \
  --out-meta "$BUN_META"
BUN_PID=$(python3 -c "import json; print(json.load(open('$BUN_META'))['pid'])")
PIDS+=("$BUN_PID")
BUN_URL="http://127.0.0.1:${BUN_PORT}/mcp"

echo "== start Bun host (dual-process forward → dataplane) =="
DUAL_PORT="$(pick_port)"
DUAL_HOME="$RUNTIME_DIR/bun-dual"
mkdir -p "$DUAL_HOME"
DUAL_META="$OUT_DIR/bun-dual-meta.json"
node "$SPAWN_BUN" \
  --port "$DUAL_PORT" \
  --home "$DUAL_HOME" \
  --catalog "$CATALOG" \
  --spec "$SPEC" \
  --api-base "$MOCK_BASE" \
  --server "$SERVER_HTTP" \
  --log "$OUT_DIR/bun-dual.log" \
  --out-meta "$DUAL_META" \
  --dataplane-url "http://127.0.0.1:${DP_PORT}"
DUAL_BUN_PID=$(python3 -c "import json; print(json.load(open('$DUAL_META'))['pid'])")
PIDS+=("$DUAL_BUN_PID")
DUAL_URL="http://127.0.0.1:${DUAL_PORT}/mcp"

for i in $(seq 1 200); do
  if curl -sf "http://127.0.0.1:${BUN_PORT}/healthz" >/dev/null 2>&1 \
    && curl -sf "http://127.0.0.1:${DUAL_PORT}/healthz" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BUN_PID" 2>/dev/null; then
    echo "bun solo exited" >&2
    tail -80 "$OUT_DIR/bun-solo.log" >&2
    exit 1
  fi
  if ! kill -0 "$DUAL_BUN_PID" 2>/dev/null; then
    echo "bun dual exited" >&2
    tail -80 "$OUT_DIR/bun-dual.log" >&2
    exit 1
  fi
  sleep 0.1
done

echo "bun_solo=$BUN_URL dual=$DUAL_URL dataplane=$DP_URL label=dual-process-e2e"

echo "== interleaved e2e client (reps=$REPS iters=$ITERS) =="
COMPARISON_LABEL=dual-process-e2e \
CF_DP_REPS="$REPS" CF_DP_ITERS="$ITERS" \
CLAWQL_BUN_MCP_URL="$BUN_URL" \
CLAWQL_BUN_PID="$BUN_PID" \
CLAWQL_DUAL_MCP_URL="$DUAL_URL" \
CLAWQL_DUAL_BUN_PID="$DUAL_BUN_PID" \
CLAWQL_DUAL_DP_PID="$DP_PID" \
CF_DP_OUT="$OUT_DIR/dual-process-e2e-summary.json" \
  node "$CLIENT"

python3 - <<PY
import json, shutil
p="$OUT_DIR/dual-process-e2e-summary.json"
d=json.load(open(p))
print("comparisonLabel:", d.get("comparisonLabel"), "reps=", d.get("reps"), "iters=", d.get("iters"))
for arm,a in d.get("arms",{}).items():
  pc=a.get("per_call") or {}
  ps=a.get("per_session") or {}
  mp=a.get("memory_plateau") or {}
  rg=a.get("ranges") or {}
  parts=a.get("memory_parts_plateau") or {}
  print(f"{arm}: errors={a.get('errors')} proxied={a.get('proxiedFromCount')} "
        f"call_p50={pc.get('p50')} call_p999={pc.get('p999')} "
        f"sess_p50={ps.get('p50')} total_plateau_mb={mp.get('median_mb')} "
        f"ranges_plateau={rg.get('plateau_mb')}")
  if parts:
    for k,v in parts.items():
      print(f"  part[{k}].median_mb={(v or {}).get('median_mb')}")
pub="$ROOT/docs/benchmarks/gateway-multi-comparison/dataplane-dual-process-e2e-3x10k.json"
shutil.copy(p, pub)
print("published", pub)
need = d["reps"] * d["iters"] * d["stepsPerIter"]
got = (d["arms"]["dual_process"].get("proxiedFromCount") or 0)
if got < need * 0.9:
  raise SystemExit(f"dual_process proxiedFromCount {got} << expected ~{need} — forward not wired")
print("forward_ok", got, "/", need)
PY
