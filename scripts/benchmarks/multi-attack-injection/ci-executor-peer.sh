#!/usr/bin/env bash
# Multi-attack: Executor fronts equal-arm Obsidian vault-mcp.
# Defaults: stock Executor (no policy block) → expect attack loss.
# Best-config: native coreTools.policies.create action=block on memory_ingest
#   (Executor's own mechanism — not a ClawQL deny-tools proxy).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/multi-attack-injection"
# shellcheck source=shared-obsidian-vault.sh
source "$HARNESS/shared-obsidian-vault.sh"

SHARED="${MAI_SHARED_VAULT_ROOT:-/tmp/mai-exec-shared/vault}"
VAULT_PORT="${MAI_VAULT_PORT:-18793}"
EXEC_PORT="${EXECUTOR_PORT:-4789}"
EXEC_HOME="${EXECUTOR_INSTALL:-/tmp/executor-gov}"
RESULTS_DIR="${MAI_PEER_RESULTS_DIR:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/peer-results}"
SLUG="${EXECUTOR_FIXTURE_SLUG:-mai-vault}"
NS="${EXECUTOR_FIXTURE_NS:-${SLUG}.org.default}"
# Address is integration.owner.connection.tool — e.g. mai-vault.org.default.memory_ingest.
# A single-segment wildcard (mai-vault.*.memory_ingest) does NOT match org.default.
POLICY_PATTERN="${EXECUTOR_BLOCK_PATTERN:-${NS}.memory_ingest}"

mkdir -p "$RESULTS_DIR" "$EXEC_HOME"
if [ ! -x "$EXEC_HOME/node_modules/.bin/executor" ]; then
  echo "== npm i executor@latest in $EXEC_HOME =="
  (cd "$EXEC_HOME" && npm i --silent executor@latest)
fi
export PATH="$EXEC_HOME/node_modules/.bin:$PATH"

mai_seed_shared_vault "$SHARED"

VAULT_PID=""
cleanup() {
  if [ -n "${VAULT_PID}" ]; then kill "$VAULT_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

echo "== start Obsidian equal-arm vault-mcp on :$VAULT_PORT =="
mai_start_vault_mcp "$SHARED" "$VAULT_PORT"
VAULT_PID="$MAI_VAULT_MCP_PID"
mai_wait_http "http://127.0.0.1:${VAULT_PORT}/health"

echo "== ensure Executor daemon =="
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

export POLICY_PATTERN
echo "== clear prior block policies on $POLICY_PATTERN (idempotent) =="
# List and remove matching policies so defaults measure is clean
LIST_JSON="$(executor call executor coreTools policies list '{}' 2>/dev/null || echo '{}')"
printf '%s' "$LIST_JSON" | python3 -c '
import json,sys,subprocess,os
try:
  d=json.load(sys.stdin)
except Exception:
  d={}
data=d.get("data") or d
pols=data.get("policies") or data.get("items") or []
pat=os.environ.get("POLICY_PATTERN","mai-vault.org.default.memory_ingest")
for p in pols:
  if not isinstance(p, dict): continue
  if p.get("action")!="block": continue
  # Clear any leftover harness blocks (incl. accidental "*" from probes)
  pl=str(p.get("pattern",""))
  if pl!="*" and pat not in pl and "memory_ingest" not in pl and "mai-vault" not in pl:
    continue
  pid=p.get("id"); owner=p.get("owner") or "org"
  if not pid: continue
  print(f"remove policy {pid}", flush=True)
  subprocess.run(["executor","call","executor","coreTools","policies","remove",
    json.dumps({"id":pid,"owner":owner})], check=False)
' || true

export MAI_SHARED_VAULT_ROOT="$SHARED"
export GOV_SHARED_VAULT_ROOT="$SHARED"
export EXECUTOR_MCP_URL="${BASE}/mcp"
export EXECUTOR_MCP_TOKEN="$TOKEN"
export EXECUTOR_API_KEY="$TOKEN"
export EXECUTOR_FIXTURE_NS="$NS"
export POLICY_PATTERN

echo "== measure executor defaults (no policy block) =="
mai_seed_shared_vault "$SHARED"
unset EXECUTOR_MCP_URL_BLOCK || true
node "$HARNESS/run-peer.mjs" executor defaults | tee "$RESULTS_DIR/executor_default.json"

echo "== create native Executor policy block on $POLICY_PATTERN =="
CREATE_JSON="$(exec_call executor coreTools policies create "$(python3 -c "
import json,os
print(json.dumps({
  'owner': 'org',
  'pattern': os.environ.get('POLICY_PATTERN','mai-vault.org.default.memory_ingest'),
  'action': 'block',
}))
")")"
echo "$CREATE_JSON" | head -c 500
echo
POLICY_ID="$(printf '%s' "$CREATE_JSON" | python3 -c '
import json,sys,re
t=sys.stdin.read()
try:
  d=json.loads(t)
except Exception:
  d={}
data=d.get("data") or d
pid=data.get("id") or ""
if not pid:
  m=re.search(r"pol_[a-z0-9]+", t)
  pid=m.group(0) if m else ""
print(pid, end="")
' || true)"
if [ -z "$POLICY_ID" ]; then
  echo "ci-executor-peer: failed to create native policies.block — writing pending best_config" >&2
  cat >"$RESULTS_DIR/executor_best_config.json" <<EOF
{
  "id": "executor_best_config",
  "peer": "executor",
  "column": "best_config",
  "skipped": true,
  "status": "pending",
  "skipUnlessEnv": "EXECUTOR_MCP_URL_BLOCK",
  "attacks_planted": 12,
  "attacks_effectuated": null,
  "rate": null,
  "detail": "Native Executor coreTools.policies.create action=block could not be applied in this harness run (pattern=${POLICY_PATTERN}). pending ≠ not_offered. Do not attribute a deny-tools proxy to Executor."
}
EOF
else
  echo "POLICY_ID=$POLICY_ID pattern=$POLICY_PATTERN"
  echo "== measure executor best_config (native policies.block) =="
  mai_seed_shared_vault "$SHARED"
  # Same Executor MCP URL — policy is Executor-native, not a stand-in proxy
  export EXECUTOR_MCP_URL_BLOCK="${BASE}/mcp"
  unset EXECUTOR_MCP_URL || true
  node "$HARNESS/run-peer.mjs" executor best_config | tee "$RESULTS_DIR/executor_best_config.json"

  # Honesty gate: if policy did not stop trusted effectuation, mark pending rather
  # than publish a false best-config win under Executor's name.
  EFFECTUATED="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("attacks_effectuated"))' "$RESULTS_DIR/executor_best_config.json" 2>/dev/null || echo "")"
  if [ "$EFFECTUATED" != "0" ]; then
    echo "ci-executor-peer: native policy did not yield 0/12 (effectuated=$EFFECTUATED) — rewriting as pending" >&2
    cat >"$RESULTS_DIR/executor_best_config.json" <<EOF
{
  "id": "executor_best_config",
  "peer": "executor",
  "column": "best_config",
  "skipped": true,
  "status": "pending",
  "skipUnlessEnv": "EXECUTOR_MCP_URL_BLOCK",
  "attacks_planted": 12,
  "attacks_effectuated": null,
  "rate": null,
  "detail": "Native policies.block on ${POLICY_PATTERN} was created (id=${POLICY_ID}) but did not stop trusted effectuation in this harness (measured effectuated=${EFFECTUATED}). pending ≠ not_offered. Do not attribute a deny-tools proxy to Executor."
}
EOF
  fi

  echo "== remove policy $POLICY_ID (leave daemon clean) =="
  exec_call executor coreTools policies remove "{\"id\":\"$POLICY_ID\",\"owner\":\"org\"}" \
    >/tmp/mai-exec-policy-rm.json || true
fi

echo "wrote $RESULTS_DIR/executor_*.json"
echo "note: best_config uses Executor native policies.block on $POLICY_PATTERN — not deny-tools-mcp"
