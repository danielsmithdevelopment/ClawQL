#!/usr/bin/env bash
# Week-1 signal: Cloudflare curated known-ops through Bun host + Rust dataplane,
# interleaved, 3 reps. BOTH sides share the same SQLite catalog + CF replay mock.
#
# Label: fast-path-only — Rust Phase A has no governance. Not a go/no-go bar.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${CF_DP_OUT_DIR:-/opt/cursor/artifacts/dataplane-week1}"
REPS="${CF_DP_REPS:-3}"
ITERS="${CF_DP_ITERS:-200}"
mkdir -p "$OUT_DIR"

SPEC="$ROOT/scripts/dataplane/fixtures/cloudflare-curated-openapi.json"
CATALOG="$ROOT/scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite"
MOCK_JS="$ROOT/scripts/dataplane/mock/cloudflare-replay-mock.mjs"
CLIENT="$ROOT/scripts/dataplane/week1-cf-known-op-client.mjs"
BUN_HOME="$OUT_DIR/bun-home"
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
  # Don't block forever on children ignoring SIGTERM.
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
cd "$ROOT/crates"
cargo build -p clawql-dataplane --release --quiet
CLAWQL_API_BASE_URL="$MOCK_BASE" \
  ./target/release/clawql-dataplane \
  --bind "127.0.0.1:${DP_PORT}" \
  --catalog "$CATALOG" \
  >"$OUT_DIR/dataplane.log" 2>&1 &
PIDS+=($!)
DP_PID="${PIDS[-1]}"
DP_URL="http://127.0.0.1:${DP_PORT}/mcp"

echo "== start Bun host (SQLite LOAD=db, equal-arm lean) =="
BUN_PORT="$(pick_port)"
SERVER_HTTP="$ROOT/dist/server-http.js"
if [ ! -f "$SERVER_HTTP" ]; then
  echo "missing $SERVER_HTTP — run root build first" >&2
  exit 1
fi

INSTANCE_SPEC=$(cd "$ROOT" && node --input-type=module -e 'import { clawqlEqualArmInstanceSpec } from "./scripts/dataplane/lib/clawql-bench-env.mjs"; console.log(JSON.stringify(clawqlEqualArmInstanceSpec()))')

(
  cd "$ROOT"
  export CLAWQL_HOME="$BUN_HOME"
  export CLAWQL_OBSIDIAN_VAULT_PATH="$BUN_HOME"
  export CLAWQL_API_BASE_URL="$MOCK_BASE"
  export CLAWQL_CATALOG_SQLITE=1
  export CLAWQL_CATALOG_SQLITE_PATH="$CATALOG"
  export CLAWQL_CATALOG_SQLITE_LOAD=db
  export CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1
  export CLAWQL_BUNDLED_OFFLINE=1
  export CLAWQL_TIER=local
  export CLAWQL_INSTANCE_SPEC="$INSTANCE_SPEC"
  export CLAWQL_CAPABILITY_LIFECYCLE=0
  export CLAWQL_ALLOW_NO_ENFORCEMENT=1
  export CLAWQL_OPENAPI_EXECUTE_PATH=rest
  export CLAWQL_AUDIT_MAX_ENTRIES=64
  export CLAWQL_SEARCH_COMPACT=1
  export CLAWQL_HTTP_SKIP_PAYMENTS=1
  export CLAWQL_HTTP_SKIP_GRAPHQL=1
  export CLAWQL_ENABLE_MEMORY=0
  export CLAWQL_ENABLE_DOCUMENTS=0
  export CLAWQL_ENABLE_ONYX=0
  export CLAWQL_ENABLE_SANDBOX=0
  export CLAWQL_ENABLE_SCHEDULE=0
  export CLAWQL_ENABLE_NOTIFY=0
  export CLAWQL_ENABLE_OBSERVABILITY=0
  export CLAWQL_ENABLE_GOOGLE=0
  export CLAWQL_ENABLE_AWS=0
  export CLAWQL_ENABLE_CHATGPT_EXTENSIONS=0
  unset CLAWQL_SPEC_PATH CLAWQL_SPEC_PATHS CLAWQL_SPEC_URL CLAWQL_PROVIDER CLAWQL_BUNDLED_PROVIDERS
  unset CLAWQL_WORM_ENABLED CLAWQL_WORM_LOCAL CLAWQL_WORM_REMOTE
  export PORT="$BUN_PORT"
  exec bun --smol "$SERVER_HTTP"
) >"$OUT_DIR/bun.log" 2>&1 &
PIDS+=($!)
BUN_PID="${PIDS[-1]}"
BUN_URL="http://127.0.0.1:${BUN_PORT}/mcp"

for i in $(seq 1 100); do
  if curl -sf "http://127.0.0.1:${DP_PORT}/healthz" >/dev/null; then break; fi
  sleep 0.1
  if [ "$i" -eq 100 ]; then echo "dataplane not healthy" >&2; cat "$OUT_DIR/dataplane.log" >&2; exit 1; fi
done

for i in $(seq 1 200); do
  if curl -sf "http://127.0.0.1:${BUN_PORT}/healthz" >/dev/null 2>&1; then break; fi
  if grep -qiE 'listening|started|mcp' "$OUT_DIR/bun.log" 2>/dev/null \
    && curl -sf "http://127.0.0.1:${BUN_PORT}/mcp" \
         -H 'content-type: application/json' \
         -H 'accept: application/json, text/event-stream' \
         -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
         >/dev/null 2>&1; then
    break
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
cat "$OUT_DIR/week1-summary.json"
