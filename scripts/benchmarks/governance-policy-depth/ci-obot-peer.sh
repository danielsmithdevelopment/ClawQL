#!/usr/bin/env bash
# Bootstrap vault-mcp + Obot, register catalog entry, run governance board with Obot arm.
# Requires Docker. Cheap-model allowlist is N/A (scripted board — no LLM).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/governance-policy-depth"
SHARED="${GOV_SHARED_VAULT_ROOT:-/tmp/gov-shared-vault}"
VAULT_PORT="${GOV_VAULT_PORT:-18780}"
OBOT_PORT="${OBOT_PORT:-8080}"
TOKEN="${OBOT_BOOTSTRAP_TOKEN:-clawql-bench-token}"
OUT="${GOV_OUT:-$ROOT/docs/benchmarks/governance-policy-depth/results-obot.json}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ci-obot-peer: docker required" >&2
  exit 2
fi

rm -rf "$SHARED"
mkdir -p "$SHARED/Memory"
cp -a "$ROOT/benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault/." "$SHARED/"

# Host IP reachable from Obot container (Linux bridge default)
HOST_IP="${GOV_HOST_IP:-}"
if [ -z "$HOST_IP" ]; then
  HOST_IP="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
  HOST_IP="${HOST_IP:-172.17.0.1}"
fi

echo "== start vault-mcp on :$VAULT_PORT (host $HOST_IP) =="
VAULT_ROOT="$SHARED" node "$HARNESS/vault-mcp.mjs" --http --port "$VAULT_PORT" &
VAULT_PID=$!
cleanup() {
  kill "$VAULT_PID" 2>/dev/null || true
  docker rm -f clawql-gov-obot 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${VAULT_PORT}/health" >/dev/null; then break; fi
  sleep 0.2
done
curl -sf "http://127.0.0.1:${VAULT_PORT}/health" >/dev/null

echo "== start Obot =="
docker rm -f clawql-gov-obot 2>/dev/null || true
docker run -d --name clawql-gov-obot -p "${OBOT_PORT}:8080" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e OBOT_SERVER_ENABLE_AUTHENTICATION=true \
  -e OBOT_BOOTSTRAP_TOKEN="$TOKEN" \
  -e OBOT_SERVER_HOSTNAME="http://127.0.0.1:${OBOT_PORT}" \
  -e OBOT_SERVER_DISALLOW_LOCALHOST_MCP=false \
  -e OBOT_SERVER_DISALLOW_PRIVATE_IPMCP=false \
  ghcr.io/obot-platform/obot:latest

echo "== wait Obot API =="
for i in $(seq 1 90); do
  if curl -sf -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:${OBOT_PORT}/api/mcp-catalogs" >/dev/null 2>&1; then
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
    \"name\": \"gov-vault\",
    \"shortDescription\": \"Governance vault MCP\",
    \"description\": \"Equal-arm adversarial vault for policy-depth board\",
    \"runtime\": \"remote\",
    \"remoteConfig\": { \"fixedURL\": \"${FIXED_URL}\" }
  }")"
echo "$ENTRY_JSON" | head -c 800
echo

CONNECT_URL="$(printf '%s' "$ENTRY_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
u=d.get("connectURL") or d.get("connectUrl") or ""
if not u:
  # fall back: list mcp servers
  print("", end="")
else:
  print(u if u.startswith("http") else "")
')"

if [ -z "$CONNECT_URL" ]; then
  # Probe mcp-servers list for ms* id
  SERVERS="$(curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:${OBOT_PORT}/api/mcp-servers" || true)"
  CONNECT_URL="$(printf '%s' "$SERVERS" | python3 -c '
import json,sys,re
try:
  d=json.load(sys.stdin)
except Exception:
  d={}
items=d if isinstance(d,list) else d.get("items") or d.get("data") or []
for it in items:
  cid=str(it.get("id") or it.get("name") or "")
  cu=it.get("connectURL") or it.get("connectUrl") or ""
  if cu:
    print(cu if str(cu).startswith("http") else ""); break
  if cid.startswith("ms") or "gov" in cid.lower():
    print(f"http://127.0.0.1:'"${OBOT_PORT}"'/mcp-connect/{cid}"); break
' || true)"
fi

if [ -z "$CONNECT_URL" ]; then
  echo "ci-obot-peer: could not resolve Obot connect URL" >&2
  echo "$ENTRY_JSON" >&2
  exit 3
fi

# Prefer loopback connect URL for the board process on the host
if [[ "$CONNECT_URL" != http* ]]; then
  CONNECT_URL="http://127.0.0.1:${OBOT_PORT}/mcp-connect/${CONNECT_URL}"
fi

echo "OBOT_MCP_URL=$CONNECT_URL"
export OBOT_MCP_URL="$CONNECT_URL"
export OBOT_MCP_TOKEN="$TOKEN"
export GOV_SHARED_VAULT_ROOT="$SHARED"
export GOV_OUT="$OUT"

# Board still requires clawql+passthrough; peer uses shared vault
node "$HARNESS/run-board.mjs"
echo "wrote $OUT"
