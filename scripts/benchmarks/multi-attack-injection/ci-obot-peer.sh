#!/usr/bin/env bash
# Multi-attack: Obot fronts equal-arm Obsidian vault-mcp; measure defaults.
# Requires Docker (Obot container). Without Docker → honest pending artifact.
# Best-config: OBOT_MCP_URL_DENY when operator wires per-tool deny (optional 2nd pass).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/multi-attack-injection"
# shellcheck source=shared-obsidian-vault.sh
source "$HARNESS/shared-obsidian-vault.sh"

SHARED="${MAI_SHARED_VAULT_ROOT:-/tmp/mai-obot-shared/vault}"
VAULT_PORT="${MAI_VAULT_PORT:-18795}"
OBOT_PORT="${OBOT_PORT:-8081}"
TOKEN="${OBOT_BOOTSTRAP_TOKEN:-clawql-bench-token}"
RESULTS_DIR="${MAI_PEER_RESULTS_DIR:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/peer-results}"

mkdir -p "$RESULTS_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "ci-obot-peer: docker not available — writing pending artifacts" >&2
  for col in defaults best_config; do
    id="obot_$([[ $col == defaults ]] && echo default || echo best_config)"
    envk="$([[ $col == defaults ]] && echo OBOT_MCP_URL || echo OBOT_MCP_URL_DENY)"
    cat >"$RESULTS_DIR/${id}.json" <<EOF
{
  "id": "${id}",
  "peer": "obot",
  "column": "${col}",
  "skipped": true,
  "status": "pending",
  "skipUnlessEnv": "${envk}",
  "attacks_planted": 12,
  "attacks_effectuated": null,
  "rate": null,
  "detail": "Obot peer CI requires Docker to bootstrap the gateway in front of the Obsidian equal-arm vault-mcp. pending ≠ not_offered. Re-run ci-obot-peer.sh where Docker is available."
}
EOF
  done
  echo "wrote pending $RESULTS_DIR/obot_*.json"
  exit 0
fi

mai_seed_shared_vault "$SHARED"

HOST_IP="${MAI_HOST_IP:-}"
if [ -z "$HOST_IP" ]; then
  HOST_IP="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
  HOST_IP="${HOST_IP:-172.17.0.1}"
fi

VAULT_PID=""
cleanup() {
  if [ -n "${VAULT_PID}" ]; then kill "$VAULT_PID" 2>/dev/null || true; fi
  docker rm -f clawql-mai-obot 2>/dev/null || true
}
trap cleanup EXIT

echo "== start Obsidian equal-arm vault-mcp on :$VAULT_PORT (host $HOST_IP) =="
mai_start_vault_mcp "$SHARED" "$VAULT_PORT"
VAULT_PID="$MAI_VAULT_MCP_PID"
mai_wait_http "http://127.0.0.1:${VAULT_PORT}/health"

echo "== start Obot =="
docker rm -f clawql-mai-obot 2>/dev/null || true
docker run -d --name clawql-mai-obot -p "${OBOT_PORT}:8080" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e OBOT_SERVER_ENABLE_AUTHENTICATION=true \
  -e OBOT_BOOTSTRAP_TOKEN="$TOKEN" \
  -e OBOT_SERVER_HOSTNAME="http://127.0.0.1:${OBOT_PORT}" \
  -e OBOT_SERVER_DISALLOW_LOCALHOST_MCP=false \
  -e OBOT_SERVER_DISALLOW_PRIVATE_IPMCP=false \
  ghcr.io/obot-platform/obot:latest

echo "== wait Obot API =="
for i in $(seq 1 90); do
  if curl -sf -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:${OBOT_PORT}/api/mcp-catalogs" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

FIXED_URL="http://${HOST_IP}:${VAULT_PORT}/mcp"
echo "== register vault MCP entry fixedURL=$FIXED_URL =="
ENTRY_JSON="$(curl -sS -X POST "http://127.0.0.1:${OBOT_PORT}/api/mcp-catalogs/default/entries" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"mai-vault\",
    \"shortDescription\": \"Multi-attack Obsidian equal-arm vault\",
    \"description\": \"Shared Memory/ fixture for injection board\",
    \"runtime\": \"remote\",
    \"remoteConfig\": { \"fixedURL\": \"${FIXED_URL}\" }
  }")"
echo "$ENTRY_JSON" | head -c 800
echo

CONNECT_URL="$(printf '%s' "$ENTRY_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
u=d.get("connectURL") or d.get("connectUrl") or ""
print(u if str(u).startswith("http") else "", end="")
')"

if [ -z "$CONNECT_URL" ]; then
  SERVERS="$(curl -sS -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:${OBOT_PORT}/api/mcp-servers" || true)"
  CONNECT_URL="$(printf '%s' "$SERVERS" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  d={}
items=d if isinstance(d,list) else d.get("items") or d.get("data") or []
for it in items:
  cu=it.get("connectURL") or it.get("connectUrl") or ""
  if cu:
    print(cu if str(cu).startswith("http") else ""); break
  cid=str(it.get("id") or "")
  if cid.startswith("ms"):
    print(f"http://127.0.0.1:'"${OBOT_PORT}"'/mcp-connect/{cid}"); break
' || true)"
fi

if [ -z "$CONNECT_URL" ]; then
  echo "ci-obot-peer: could not resolve Obot connect URL" >&2
  exit 3
fi
if [[ "$CONNECT_URL" != http* ]]; then
  CONNECT_URL="http://127.0.0.1:${OBOT_PORT}/mcp-connect/${CONNECT_URL}"
fi

export MAI_SHARED_VAULT_ROOT="$SHARED"
export GOV_SHARED_VAULT_ROOT="$SHARED"
export OBOT_MCP_URL="$CONNECT_URL"
export OBOT_MCP_TOKEN="$TOKEN"

echo "OBOT_MCP_URL=$OBOT_MCP_URL"
echo "== measure obot defaults =="
mai_seed_shared_vault "$SHARED"
node "$HARNESS/run-peer.mjs" obot defaults | tee "$RESULTS_DIR/obot_default.json"

# Best-config requires operator tool deny; without it write pending.
if [ -n "${OBOT_MCP_URL_DENY:-}" ]; then
  mai_seed_shared_vault "$SHARED"
  node "$HARNESS/run-peer.mjs" obot best_config | tee "$RESULTS_DIR/obot_best_config.json"
else
  cat >"$RESULTS_DIR/obot_best_config.json" <<EOF
{
  "id": "obot_best_config",
  "peer": "obot",
  "column": "best_config",
  "skipped": true,
  "status": "pending",
  "skipUnlessEnv": "OBOT_MCP_URL_DENY",
  "attacks_planted": 12,
  "attacks_effectuated": null,
  "rate": null,
  "detail": "Defaults measured. Wire OBOT_MCP_URL_DENY (per-tool deny on memory_ingest) for best-config column."
}
EOF
fi

echo "wrote $RESULTS_DIR/obot_*.json"
