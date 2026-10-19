#!/usr/bin/env bash
# Multi-attack: Bifrost fronts equal-arm Obsidian vault-mcp; measure defaults + best-config.
# Defaults = allow-all VK (passthrough-equivalent loss expected).
# Best-config = VK that omits memory_ingest (peer tool deny).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/multi-attack-injection"
# shellcheck source=shared-obsidian-vault.sh
source "$HARNESS/shared-obsidian-vault.sh"

SHARED="${MAI_SHARED_VAULT_ROOT:-/tmp/mai-bf-shared/vault}"
VAULT_PORT="${MAI_VAULT_PORT:-18792}"
BF_PORT="${BIFROST_PORT:-18892}"
BF_WORK="${BIFROST_WORK:-/tmp/mai-bf-work}"
BF_BIN="${BIFROST_BIN:-}"
VK_ALLOW="${BIFROST_VK:-sk-bf-clawql-mai-allow}"
VK_DENY="${BIFROST_VK_DENY:-sk-bf-clawql-mai-deny}"
SETUP_TOKEN="${BIFROST_SETUP_TOKEN:-clawql-mai-setup}"
CLIENT_NAME="${BIFROST_MCP_CLIENT_NAME:-mai_vault}"
RESULTS_DIR="${MAI_PEER_RESULTS_DIR:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/peer-results}"

mkdir -p "$RESULTS_DIR"
mai_seed_shared_vault "$SHARED"

mkdir -p "$BF_WORK"
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
        "id": "vk-mai-allow",
        "name": "mai-allow-all",
        "value": "${VK_ALLOW}",
        "is_active": true,
        "allow_all_providers": true
      },
      {
        "id": "vk-mai-deny",
        "name": "mai-deny-ingest",
        "value": "${VK_DENY}",
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

echo "== start Obsidian equal-arm vault-mcp on :$VAULT_PORT =="
mai_start_vault_mcp "$SHARED" "$VAULT_PORT"
VAULT_PID="$MAI_VAULT_MCP_PID"
mai_wait_http "http://127.0.0.1:${VAULT_PORT}/health"
curl -sf "http://127.0.0.1:${VAULT_PORT}/health"

echo "== start Bifrost on :$BF_PORT =="
"$BF_BIN" -app-dir "$BF_WORK" -host 127.0.0.1 -port "$BF_PORT" -log-level warn &
BF_PID=$!
mai_wait_http "http://127.0.0.1:${BF_PORT}/health" 90

echo "== register MCP client $CLIENT_NAME → vault =="
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
echo "$ADD_JSON" | head -c 400
echo

LIST="$(curl -sS -H "X-Bifrost-Setup-Token: ${SETUP_TOKEN}" \
  "http://127.0.0.1:${BF_PORT}/api/mcp/clients" || true)"
if ! printf '%s' "$ADD_JSON$LIST" | grep -q "$CLIENT_NAME"; then
  echo "ci-bifrost-peer: failed to register MCP client" >&2
  exit 3
fi

echo "== VK allow-all on $CLIENT_NAME =="
curl -sS -X PUT "http://127.0.0.1:${BF_PORT}/api/governance/virtual-keys/vk-mai-allow" \
  -H "X-Bifrost-Setup-Token: ${SETUP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"mai-allow-all\",
    \"is_active\": true,
    \"allow_all_providers\": true,
    \"mcp_configs\": [
      { \"mcp_client_name\": \"${CLIENT_NAME}\", \"tools_to_execute\": [\"*\"] }
    ]
  }" | head -c 300
echo

echo "== VK deny memory_ingest on $CLIENT_NAME =="
curl -sS -X PUT "http://127.0.0.1:${BF_PORT}/api/governance/virtual-keys/vk-mai-deny" \
  -H "X-Bifrost-Setup-Token: ${SETUP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"mai-deny-ingest\",
    \"is_active\": true,
    \"allow_all_providers\": true,
    \"mcp_configs\": [
      { \"mcp_client_name\": \"${CLIENT_NAME}\", \"tools_to_execute\": [\"memory_recall\"] }
    ]
  }" | head -c 300
echo

export MAI_SHARED_VAULT_ROOT="$SHARED"
export GOV_SHARED_VAULT_ROOT="$SHARED"

echo "== measure bifrost defaults (allow-all) =="
mai_seed_shared_vault "$SHARED"
export BIFROST_MCP_URL="http://127.0.0.1:${BF_PORT}/mcp"
export BIFROST_VK="$VK_ALLOW"
unset BIFROST_MCP_URL_DENY || true
node "$HARNESS/run-peer.mjs" bifrost defaults | tee "$RESULTS_DIR/bifrost_default.json"

echo "== measure bifrost best_config (omit memory_ingest) =="
mai_seed_shared_vault "$SHARED"
unset BIFROST_MCP_URL || true
export BIFROST_MCP_URL_DENY="http://127.0.0.1:${BF_PORT}/mcp"
export BIFROST_VK="$VK_DENY"
node "$HARNESS/run-peer.mjs" bifrost best_config | tee "$RESULTS_DIR/bifrost_best_config.json"

echo "wrote $RESULTS_DIR/bifrost_*.json"
