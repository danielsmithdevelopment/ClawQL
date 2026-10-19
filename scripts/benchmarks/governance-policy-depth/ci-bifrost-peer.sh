#!/usr/bin/env bash
# Bootstrap vault-mcp + Bifrost HTTP gateway, register vault MCP client + allow-all VK,
# run governance board with Bifrost arm — same shape as ci-obot-peer.sh.
# Default peer config is allow-all (tools_to_execute=["*"]) — passthrough-equivalent loss.
# No LLM. Requires network for bifrost binary (npx @maximhq/bifrost) on first run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/governance-policy-depth"
SHARED="${GOV_SHARED_VAULT_ROOT:-/tmp/gov-bf-shared}"
VAULT_PORT="${GOV_VAULT_PORT:-18780}"
BF_PORT="${BIFROST_PORT:-18888}"
BF_WORK="${BIFROST_WORK:-/tmp/gov-bf-work}"
BF_BIN="${BIFROST_BIN:-}"
VK="${BIFROST_VK:-sk-bf-clawql-gov-bench}"
SETUP_TOKEN="${BIFROST_SETUP_TOKEN:-clawql-gov-setup}"
CLIENT_NAME="${BIFROST_MCP_CLIENT_NAME:-gov_vault}"
OUT="${GOV_OUT:-$ROOT/docs/benchmarks/governance-policy-depth/results-bifrost.json}"

rm -rf "$SHARED"
mkdir -p "$SHARED/Memory"
cp -a "$ROOT/benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault/." "$SHARED/"

mkdir -p "$BF_WORK"
# Fresh app-dir so config.db matches this run (hyphenated client names are rejected by Bifrost).
if [ "${BIFROST_KEEP_WORK:-0}" != "1" ]; then
  rm -rf "$BF_WORK"
  mkdir -p "$BF_WORK"
fi

cat >"$BF_WORK/config.json" <<EOF
{
  "setup_token": "${SETUP_TOKEN}",
  "client": { "enforce_auth_on_inference": false },
  "governance": {
    "virtual_keys": [
      {
        "id": "vk-gov-allow",
        "name": "gov-allow-all",
        "value": "${VK}",
        "is_active": true,
        "allow_all_providers": true
      }
    ]
  }
}
EOF

resolve_bifrost_bin() {
  if [ -n "$BF_BIN" ] && [ -x "$BF_BIN" ]; then
    echo "$BF_BIN"
    return
  fi
  local found
  found="$(find "${HOME}/.cache/bifrost" -type f -name 'bifrost-http-*' 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$found" ] && [ -x "$found" ]; then
    echo "$found"
    return
  fi
  echo "== fetch bifrost via npx @maximhq/bifrost ==" >&2
  (cd /tmp && npx --yes @maximhq/bifrost version >/dev/null 2>&1) || true
  found="$(find "${HOME}/.cache/bifrost" -type f -name 'bifrost-http-*' 2>/dev/null | sort -V | tail -1 || true)"
  if [ -z "$found" ] || [ ! -x "$found" ]; then
    echo "ci-bifrost-peer: bifrost-http binary not found" >&2
    exit 2
  fi
  echo "$found"
}

BF_BIN="$(resolve_bifrost_bin)"
echo "BIFROST_BIN=$BF_BIN"

VAULT_PID=""
BF_PID=""
cleanup() {
  if [ -n "${BF_PID}" ]; then kill "$BF_PID" 2>/dev/null || true; fi
  if [ -n "${VAULT_PID}" ]; then kill "$VAULT_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

echo "== start vault-mcp on :$VAULT_PORT =="
VAULT_ROOT="$SHARED" node "$HARNESS/vault-mcp.mjs" --http --port "$VAULT_PORT" &
VAULT_PID=$!
for i in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${VAULT_PORT}/health" >/dev/null; then break; fi
  sleep 0.1
done
curl -sf "http://127.0.0.1:${VAULT_PORT}/health" >/dev/null

echo "== start Bifrost on :$BF_PORT =="
"$BF_BIN" -app-dir "$BF_WORK" -host 127.0.0.1 -port "$BF_PORT" -log-level warn &
BF_PID=$!
for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${BF_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -sf "http://127.0.0.1:${BF_PORT}/health" >/dev/null

echo "== register MCP client $CLIENT_NAME → vault :$VAULT_PORT =="
# Private/loopback HTTP clients require setup token when dashboard auth is unset.
ADD_JSON="$(curl -sS -X POST "http://127.0.0.1:${BF_PORT}/api/mcp/client" \
  -H "X-Bifrost-Setup-Token: ${SETUP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${CLIENT_NAME}\",
    \"connection_type\": \"http\",
    \"connection_string\": \"http://127.0.0.1:${VAULT_PORT}/mcp\",
    \"auth_type\": \"none\",
    \"is_ping_available\": false,
    \"tools_to_execute\": [\"*\"],
    \"allow_by_default\": true
  }")"
echo "$ADD_JSON" | head -c 600
echo

# Idempotent: if already exists, continue
if ! printf '%s' "$ADD_JSON" | grep -qiE 'success|already|exists|duplicate'; then
  # Also accept healthy list containing our client
  LIST="$(curl -sS -H "X-Bifrost-Setup-Token: ${SETUP_TOKEN}" \
    "http://127.0.0.1:${BF_PORT}/api/mcp/clients")"
  if ! printf '%s' "$LIST" | grep -q "$CLIENT_NAME"; then
    echo "ci-bifrost-peer: failed to register MCP client" >&2
    echo "$ADD_JSON" >&2
    exit 3
  fi
fi

echo "== scope VK mcp_configs allow-all on $CLIENT_NAME =="
curl -sS -X PUT "http://127.0.0.1:${BF_PORT}/api/governance/virtual-keys/vk-gov-allow" \
  -H "X-Bifrost-Setup-Token: ${SETUP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"gov-allow-all\",
    \"is_active\": true,
    \"allow_all_providers\": true,
    \"mcp_configs\": [
      { \"mcp_client_name\": \"${CLIENT_NAME}\", \"tools_to_execute\": [\"*\"] }
    ]
  }" | head -c 400
echo

echo "== smoke tools/list via /mcp =="
curl -sf --max-time 15 \
  -H "x-bf-vk: ${VK}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  "http://127.0.0.1:${BF_PORT}/mcp" | head -c 500
echo

export BIFROST_MCP_URL="http://127.0.0.1:${BF_PORT}/mcp"
export BIFROST_VK="$VK"
export GOV_SHARED_VAULT_ROOT="$SHARED"
export GOV_OUT="$OUT"

echo "BIFROST_MCP_URL=$BIFROST_MCP_URL"
echo "GOV_SHARED_VAULT_ROOT=$GOV_SHARED_VAULT_ROOT"

node "$HARNESS/run-board.mjs"
echo "wrote $OUT"
