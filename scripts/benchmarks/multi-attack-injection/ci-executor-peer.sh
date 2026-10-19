#!/usr/bin/env bash
# Multi-attack: Executor fronts equal-arm Obsidian vault-mcp; measure defaults.
# Best-config: same MCP with EXECUTOR_MCP_URL_BLOCK pointing at a deny-tools
# wrapper (peer-recommended tool deny) — Executor stock has no Obsidian vault.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/multi-attack-injection"
GOV="$ROOT/scripts/benchmarks/governance-policy-depth"
# shellcheck source=shared-obsidian-vault.sh
source "$HARNESS/shared-obsidian-vault.sh"

SHARED="${MAI_SHARED_VAULT_ROOT:-/tmp/mai-exec-shared/vault}"
VAULT_PORT="${MAI_VAULT_PORT:-18793}"
DENY_PORT="${MAI_DENY_PORT:-18794}"
EXEC_PORT="${EXECUTOR_PORT:-4789}"
EXEC_HOME="${EXECUTOR_INSTALL:-/tmp/executor-gov}"
RESULTS_DIR="${MAI_PEER_RESULTS_DIR:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/peer-results}"
SLUG="${EXECUTOR_FIXTURE_SLUG:-mai-vault}"
NS="${EXECUTOR_FIXTURE_NS:-${SLUG}.org.default}"
EXEC_HOST="${EXECUTOR_HOST:-127.0.0.1}"
BASE="http://${EXEC_HOST}:${EXEC_PORT}"

mkdir -p "$RESULTS_DIR" "$EXEC_HOME"
if [ ! -x "$EXEC_HOME/node_modules/.bin/executor" ]; then
  echo "== npm i executor@latest in $EXEC_HOME =="
  (cd "$EXEC_HOME" && npm i --silent executor@latest)
fi
export PATH="$EXEC_HOME/node_modules/.bin:$PATH"

mai_seed_shared_vault "$SHARED"

VAULT_PID=""
DENY_PID=""
cleanup() {
  if [ -n "${DENY_PID}" ]; then kill "$DENY_PID" 2>/dev/null || true; fi
  if [ -n "${VAULT_PID}" ]; then kill "$VAULT_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

echo "== start Obsidian equal-arm vault-mcp on :$VAULT_PORT =="
mai_start_vault_mcp "$SHARED" "$VAULT_PORT"
VAULT_PID="$MAI_VAULT_MCP_PID"
mai_wait_http "http://127.0.0.1:${VAULT_PORT}/health"

echo "== start deny-tools wrapper (best-config) on :$DENY_PORT =="
# Thin proxy: same vault surface but memory_ingest always denied — peer best-config stand-in
VAULT_ROOT="$SHARED" DENY_TOOLS=memory_ingest \
  node "$HARNESS/deny-tools-mcp.mjs" --http --port "$DENY_PORT" &
DENY_PID=$!
mai_wait_http "http://127.0.0.1:${DENY_PORT}/health"

echo "== ensure Executor daemon =="
# Prefer an already-running daemon (often localhost:4788) before starting a new one.
if curl -sf "http://127.0.0.1:${EXEC_PORT}/" >/dev/null 2>&1; then
  BASE="http://127.0.0.1:${EXEC_PORT}"
elif curl -sf "http://127.0.0.1:4788/" >/dev/null 2>&1; then
  EXEC_PORT=4788
  BASE="http://127.0.0.1:4788"
elif curl -sf "http://localhost:4788/" >/dev/null 2>&1; then
  EXEC_PORT=4788
  BASE="http://localhost:4788"
else
  executor daemon stop 2>/dev/null || true
  executor daemon run --port "$EXEC_PORT" --hostname 127.0.0.1 --log-level warn
  BASE="http://127.0.0.1:${EXEC_PORT}"
fi
for i in $(seq 1 60); do
  if curl -sf "${BASE}/" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -sf "${BASE}/" >/dev/null
echo "Executor BASE=$BASE"

AUTH_FILE="${HOME}/.executor/server-control/auth.json"
TOKEN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["token"])' "$AUTH_FILE")"

exec_call() {
  local args=("$@")
  local raw eid
  set +e
  raw="$(executor call "${args[@]}" 2>&1)"
  local ec=$?
  set -e
  if printf '%s' "$raw" | grep -q 'executionId:'; then
    eid="$(printf '%s' "$raw" | python3 -c '
import sys,re
t=sys.stdin.read()
m=re.search(r"executionId:\s*(exec_[0-9a-fA-F-]+)", t)
print(m.group(1) if m else "")
')"
    if [ -z "$eid" ]; then
      printf '%s\n' "$raw" >&2
      echo "ci-executor-peer: paused but no executionId" >&2
      exit 3
    fi
    echo "== resume accept $eid ==" >&2
    executor resume --execution-id "$eid" --base-url "$BASE" --action accept --content '{}'
  else
    if [ "$ec" -ne 0 ]; then
      printf '%s\n' "$raw" >&2
      exit "$ec"
    fi
    printf '%s\n' "$raw"
  fi
}

echo "== drop prior $SLUG (idempotent) =="
exec_call executor coreTools integrations remove "{\"slug\":\"$SLUG\"}" >/tmp/mai-exec-rm.json || true

echo "== register vault MCP ($SLUG → :$VAULT_PORT) =="
exec_call executor mcp addServer "$(python3 -c "
import json
print(json.dumps({
  'name': '$SLUG',
  'slug': '$SLUG',
  'endpoint': 'http://127.0.0.1:${VAULT_PORT}/mcp',
  'remoteTransport': 'streamable-http',
  'auth': {'kind': 'none'},
  'authenticationTemplate': [{'kind': 'none'}],
}))
")" >/tmp/mai-exec-add.json

echo "== create connection =="
exec_call executor coreTools connections create "$(python3 -c "
import json
print(json.dumps({
  'owner': 'org',
  'name': 'default',
  'integration': '$SLUG',
  'template': 'none',
}))
")" >/tmp/mai-exec-conn.json

echo "== refresh tools =="
exec_call executor coreTools connections refresh "{\"owner\":\"org\",\"integration\":\"$SLUG\",\"name\":\"default\"}" \
  >/tmp/mai-exec-refresh.json || true

echo "== verify memory_ingest visible =="
executor tools search memory_ingest | head -c 500
echo

export MAI_SHARED_VAULT_ROOT="$SHARED"
export GOV_SHARED_VAULT_ROOT="$SHARED"
export EXECUTOR_MCP_URL="${BASE}/mcp"
export EXECUTOR_MCP_TOKEN="$TOKEN"
export EXECUTOR_API_KEY="$TOKEN"
export EXECUTOR_FIXTURE_NS="$NS"

echo "== measure executor defaults =="
mai_seed_shared_vault "$SHARED"
# Re-point vault-mcp at reseeding: vault process still uses SHARED path — ok
node "$HARNESS/run-peer.mjs" executor defaults | tee "$RESULTS_DIR/executor_default.json"

echo "== measure executor best_config via deny-tools MCP (direct, not through Executor) =="
# Honest label: peer best-config stand-in = tool deny on equal-arm vault.
# Wire EXECUTOR_MCP_URL_BLOCK at deny wrapper so run-peer grades blocked writes.
mai_seed_shared_vault "$SHARED"
unset EXECUTOR_MCP_URL || true
export EXECUTOR_MCP_URL_BLOCK="http://127.0.0.1:${DENY_PORT}/mcp"
unset EXECUTOR_MCP_TOKEN EXECUTOR_API_KEY || true
node "$HARNESS/run-peer.mjs" executor best_config | tee "$RESULTS_DIR/executor_best_config.json"

echo "wrote $RESULTS_DIR/executor_*.json"
echo "note: best_config uses deny-tools-mcp stand-in (Executor has no built-in Obsidian vault deny); defaults measured through Executor → vault-mcp"
