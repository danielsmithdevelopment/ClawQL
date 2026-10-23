#!/usr/bin/env bash
# Phase B governance self-check (+ optional TS cross-diff).
# Spawns clawql-dataplane with CLAWQL_DATAPLANE_GOVERNANCE=1 unless CLAWQL_DP_MCP_URL is set.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/crates"

pick_free_bind() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(f"127.0.0.1:{s.getsockname()[1]}")
s.close()
PY
}

SPAWNED=0
cleanup() {
  if [ "$SPAWNED" = "1" ] && [ -n "${PID:-}" ]; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [ -z "${CLAWQL_DP_MCP_URL:-}" ]; then
  BIND="$(pick_free_bind)"
  CATALOG="${CLAWQL_DATAPLANE_CATALOG:-${CLAWQL_CATALOG_SQLITE_PATH:-$ROOT/crates/clawql-dataplane/fixtures/catalog.sqlite}}"
  HOME_TMP="${CLAWQL_HOME:-$(mktemp -d)}"
  export CLAWQL_HOME="$HOME_TMP"
  export CLAWQL_DATAPLANE_GOVERNANCE=1
  export CLAWQL_ENABLE_SESSION_IFC="${CLAWQL_ENABLE_SESSION_IFC:-0}"
  export CLAWQL_WORM_ENABLED="${CLAWQL_WORM_ENABLED:-1}"
  export CLAWQL_WORM_LOCAL="${CLAWQL_WORM_LOCAL:-memory}"
  cargo build -p clawql-dataplane --quiet
  cargo run -p clawql-dataplane --quiet -- --self-mock --bind "$BIND" --catalog "$CATALOG" \
    >/tmp/clawql-diff-governance-dp.log 2>&1 &
  PID=$!
  SPAWNED=1
  for i in $(seq 1 80); do
    if curl -sf "http://${BIND}/healthz" >/dev/null; then break; fi
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "dataplane exited before healthy" >&2
      cat /tmp/clawql-diff-governance-dp.log >&2 || true
      exit 1
    fi
    sleep 0.1
    if [ "$i" -eq 80 ]; then
      echo "dataplane did not become healthy" >&2
      exit 1
    fi
  done
  export CLAWQL_DP_MCP_URL="http://${BIND}"
  echo "spawned dataplane at $CLAWQL_DP_MCP_URL (pending=$CLAWQL_HOME)" >&2
fi

node "$ROOT/scripts/dataplane/diff-governance.mjs"
