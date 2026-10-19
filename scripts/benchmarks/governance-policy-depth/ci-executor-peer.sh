#!/usr/bin/env bash
# Bootstrap fixture-mcp + local Executor daemon, register fixture MCP,
# run cells board — same shape as ci-obot-peer.sh (install peer, wire fixture, measure).
# No LLM. Requires network for `npm i executor` on first run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/governance-policy-depth"
SHARED="${GOV_SHARED_VAULT_ROOT:-/tmp/gov-exec-shared}"
FIXTURE_PORT="${GOV_FIXTURE_PORT:-18790}"
EXEC_PORT="${EXECUTOR_PORT:-4788}"
EXEC_HOME="${EXECUTOR_INSTALL:-/tmp/executor-gov}"
OUT="${GOV_OUT:-$ROOT/docs/benchmarks/governance-policy-depth/results-cells.json}"
SLUG="${EXECUTOR_FIXTURE_SLUG:-gov-fixture}"
NS="${EXECUTOR_FIXTURE_NS:-${SLUG}.org.default}"
# Executor daemon binds ::1 by default — use localhost (not 127.0.0.1) for health checks.
EXEC_HOST="${EXECUTOR_HOST:-localhost}"
BASE="http://${EXEC_HOST}:${EXEC_PORT}"

mkdir -p "$EXEC_HOME"
if [ ! -x "$EXEC_HOME/node_modules/.bin/executor" ]; then
  echo "== npm i executor@latest in $EXEC_HOME =="
  (cd "$EXEC_HOME" && npm i --silent executor@latest)
fi
export PATH="$EXEC_HOME/node_modules/.bin:$PATH"

rm -rf "$SHARED"
mkdir -p "$SHARED/Memory"
cp -a "$ROOT/benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault/." "$SHARED/"

FX_PID=""
cleanup() {
  if [ -n "${FX_PID}" ]; then kill "$FX_PID" 2>/dev/null || true; fi
  # Leave daemon running for follow-up inspection (Obot script kills container; we keep local daemon).
}
trap cleanup EXIT

echo "== start fixture-mcp on :$FIXTURE_PORT =="
VAULT_ROOT="$SHARED" node "$HARNESS/fixture-mcp.mjs" --http --port "$FIXTURE_PORT" &
FX_PID=$!
for i in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${FIXTURE_PORT}/health" >/dev/null; then break; fi
  sleep 0.1
done
curl -sf "http://127.0.0.1:${FIXTURE_PORT}/health" >/dev/null

echo "== ensure Executor daemon on ${BASE} =="
if ! curl -sf "${BASE}/" >/dev/null 2>&1; then
  executor daemon stop 2>/dev/null || true
  # Bind 127.0.0.1 so IPv4 clients (Node MCP SDK) can connect.
  executor daemon run --port "$EXEC_PORT" --hostname 127.0.0.1 --log-level warn
  BASE="http://127.0.0.1:${EXEC_PORT}"
fi
for i in $(seq 1 60); do
  if curl -sf "${BASE}/" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -sf "${BASE}/" >/dev/null

AUTH_FILE="${HOME}/.executor/server-control/auth.json"
TOKEN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["token"])' "$AUTH_FILE")"

# Run an executor call; if it pauses for approval, accept and return final JSON.
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
exec_call executor coreTools integrations remove "{\"slug\":\"$SLUG\"}" >/tmp/gov-exec-rm.json || true

echo "== register fixture MCP ($SLUG → :$FIXTURE_PORT) =="
exec_call executor mcp addServer "$(python3 -c "
import json
print(json.dumps({
  'name': '$SLUG',
  'slug': '$SLUG',
  'endpoint': 'http://127.0.0.1:${FIXTURE_PORT}/mcp',
  'remoteTransport': 'streamable-http',
  'auth': {'kind': 'none'},
  'authenticationTemplate': [{'kind': 'none'}],
}))
")" >/tmp/gov-exec-add.json

echo "== create connection =="
exec_call executor coreTools connections create "$(python3 -c "
import json
print(json.dumps({
  'owner': 'org',
  'name': 'default',
  'integration': '$SLUG',
  'template': 'none',
}))
")" >/tmp/gov-exec-conn.json

echo "== refresh tools =="
exec_call executor coreTools connections refresh "{\"owner\":\"org\",\"integration\":\"$SLUG\",\"name\":\"default\"}" \
  >/tmp/gov-exec-refresh.json || true

echo "== verify memory_ingest visible =="
executor tools search memory_ingest | head -c 500
echo

export EXECUTOR_MCP_URL="${BASE}/mcp"
export EXECUTOR_API_KEY="$TOKEN"
export GOV_SHARED_VAULT_ROOT="$SHARED"
export EXECUTOR_FIXTURE_NS="$NS"
export GOV_OUT="$OUT"

echo "EXECUTOR_MCP_URL=$EXECUTOR_MCP_URL"
echo "GOV_SHARED_VAULT_ROOT=$GOV_SHARED_VAULT_ROOT"
echo "EXECUTOR_FIXTURE_NS=$EXECUTOR_FIXTURE_NS"

node "$HARNESS/run-cells.mjs"
echo "wrote $OUT"
