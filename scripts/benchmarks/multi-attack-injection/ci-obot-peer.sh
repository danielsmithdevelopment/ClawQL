#!/usr/bin/env bash
# Multi-attack Obot peer — equal-arm board (Mac mini / Docker).
#
# Same vault, same 12 attacks, same 14 benign as Bifrost/Executor/ClawQL.
# Defaults: stock Obot mcp-connect (allow-all → expect attack loss).
# Best-config: Obot's native gateway webhook filter denying memory_ingest
#   (docs.obot.ai/functionality/filters) — not a ClawQL deny-tools stand-in.
#
# Platform: prefer Mac mini. Docker Desktop's Linux VM is fine here — this
# board measures whether attacks take effect, not speed or memory. Results
# record host_os (darwin/linux) so readers see where the arm ran.
#
#   npm run benchmark:multi-attack-injection:obot
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HARNESS="$ROOT/scripts/benchmarks/multi-attack-injection"
# shellcheck source=shared-obsidian-vault.sh
source "$HARNESS/shared-obsidian-vault.sh"

SHARED="${MAI_SHARED_VAULT_ROOT:-/tmp/mai-obot-shared/vault}"
VAULT_PORT="${MAI_VAULT_PORT:-18795}"
FILTER_PORT="${OBOT_FILTER_PORT:-18796}"
OBOT_PORT="${OBOT_PORT:-8081}"
TOKEN="${OBOT_BOOTSTRAP_TOKEN:-clawql-bench-token}"
FILTER_SECRET="${OBOT_FILTER_SECRET:-clawql-obot-filter-secret}"
RESULTS_DIR="${MAI_PEER_RESULTS_DIR:-$ROOT/docs/benchmarks/security-suite/multi-attack-injection/peer-results}"

HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$HOST_OS" in
  darwin*) HOST_OS=darwin; HOST_LABEL=macOS; MEASURED_ON="${MAI_PEER_MEASURED_ON:-mac_mini}" ;;
  linux*)  HOST_OS=linux;  HOST_LABEL=Linux; MEASURED_ON="${MAI_PEER_MEASURED_ON:-}" ;;
  *)       HOST_LABEL="$HOST_OS"; MEASURED_ON="${MAI_PEER_MEASURED_ON:-}" ;;
esac

export MAI_PEER_PLATFORM="$HOST_OS"
export MAI_PEER_MEASURED_ON="$MEASURED_ON"
export MAI_PEER_DOCKER=1

mkdir -p "$RESULTS_DIR"

write_pending() {
  local id="$1" col="$2" envk="$3" detail="$4"
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
  "detail": $(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$detail"),
  "platform": {
    "host_os": "${HOST_OS}",
    "host_os_label": "${HOST_LABEL}",
    "measured_on": $(python3 -c 'import json,os; print(json.dumps(os.environ.get("MAI_PEER_MEASURED_ON") or None))'),
    "docker_vm_note": "Docker Desktop Linux VM is fine for this board (attack effectuation, not performance).",
    "equal_arm": "shared Obsidian Memory/ vault-mcp · same 12 attacks · same 14 benign"
  }
}
EOF
}

if ! command -v docker >/dev/null 2>&1; then
  echo "ci-obot-peer: docker not available on ${HOST_LABEL} — writing pending (run on Mac mini with Docker)" >&2
  write_pending obot_default defaults OBOT_MCP_URL \
    "Obot peer CI requires Docker. Prefer Mac mini (Docker Desktop VM OK for security outcomes). pending ≠ not_offered. Re-run: npm run benchmark:multi-attack-injection:obot"
  write_pending obot_best_config best_config OBOT_MCP_URL_DENY \
    "Obot best-config uses Obot native webhook filter deny on memory_ingest. Requires Docker + filter registration on Mac mini. pending ≠ not_offered."
  echo "wrote pending $RESULTS_DIR/obot_*.json"
  exit 0
fi

mai_seed_shared_vault "$SHARED"

HOST_IP="${MAI_HOST_IP:-}"
if [ -z "$HOST_IP" ]; then
  if [ "$HOST_OS" = "darwin" ]; then
    # Docker Desktop on macOS: host.docker.internal reaches the Mac from the VM
    HOST_IP="host.docker.internal"
  else
    HOST_IP="$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
    HOST_IP="${HOST_IP:-172.17.0.1}"
  fi
fi

VAULT_PID=""
FILTER_PID=""
cleanup() {
  if [ -n "${FILTER_PID}" ]; then kill "$FILTER_PID" 2>/dev/null || true; fi
  if [ -n "${VAULT_PID}" ]; then kill "$VAULT_PID" 2>/dev/null || true; fi
  docker rm -f clawql-mai-obot 2>/dev/null || true
}
trap cleanup EXIT

echo "== platform: ${HOST_LABEL} (${HOST_OS}) measured_on=${MEASURED_ON:-unset} =="
echo "== start Obsidian equal-arm vault-mcp on :$VAULT_PORT (host for Obot: $HOST_IP) =="
mai_start_vault_mcp "$SHARED" "$VAULT_PORT"
VAULT_PID="$MAI_VAULT_MCP_PID"
mai_wait_http "http://127.0.0.1:${VAULT_PORT}/health"

echo "== start Obot native deny webhook (memory_ingest) on :$FILTER_PORT =="
PORT="$FILTER_PORT" WEBHOOK_SECRET="$FILTER_SECRET" DENY_TOOLS=memory_ingest \
  node "$HARNESS/obot-deny-memory-ingest-webhook.mjs" &
FILTER_PID=$!
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${FILTER_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 0.15
done
curl -sf "http://127.0.0.1:${FILTER_PORT}/health" >/dev/null

OBOT_IMAGE="${OBOT_IMAGE:-ghcr.io/obot-platform/obot:latest}"
echo "== start Obot image=$OBOT_IMAGE =="
docker rm -f clawql-mai-obot 2>/dev/null || true
docker pull "$OBOT_IMAGE" >/dev/null 2>&1 || true
OBOT_DIGEST="$(docker image inspect "$OBOT_IMAGE" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
echo "OBOT_DIGEST=${OBOT_DIGEST:-unknown}"
docker run -d --name clawql-mai-obot -p "${OBOT_PORT}:8080" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e OBOT_SERVER_ENABLE_AUTHENTICATION=true \
  -e OBOT_BOOTSTRAP_TOKEN="$TOKEN" \
  -e OBOT_SERVER_HOSTNAME="http://127.0.0.1:${OBOT_PORT}" \
  -e OBOT_SERVER_DISALLOW_LOCALHOST_MCP=false \
  -e OBOT_SERVER_DISALLOW_PRIVATE_IPMCP=false \
  "$OBOT_IMAGE"

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
ENTRY_ID="$(printf '%s' "$ENTRY_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(d.get("id") or "", end="")
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
echo "== measure obot defaults (no filter) =="
mai_seed_shared_vault "$SHARED"
unset OBOT_MCP_URL_DENY || true
node "$HARNESS/run-peer.mjs" obot defaults | tee "$RESULTS_DIR/obot_default.json"
node "$HARNESS/stamp-peer-version.mjs" "$RESULTS_DIR/obot_default.json" \
  --peer obot --image "$OBOT_IMAGE" --digest "${OBOT_DIGEST:-}"

# --- Best-config: Obot native mcp-webhook-validations deny on memory_ingest ---
# Mac mini discovery: /api/mcp-filters (etc.) → 403. Correct create:
#   POST /api/mcp-webhook-validations
#   selectors: [{ method: "tools/call", identifiers: ["memory_ingest"] }]
# Obot wraps the URL in a containerized system MCP adapter. Best-config
# measurement requires a precondition: one direct memory_ingest outside the
# corpus must be refused. If not, row stays pending (configuration not active).
# Once the deny is confirmed, run the 12+14 once and publish whatever comes out.
FILTER_URL="http://${HOST_IP}:${FILTER_PORT}/webhook"
FILTER_REGISTERED=0
FILTER_CONFIGURED=0
FILTER_PATH_USED=""
echo "== register Obot webhook validation deny memory_ingest url=$FILTER_URL =="

# Preferred path first (Mac mini–verified), then older guesses.
for path in \
  "/api/mcp-webhook-validations" \
  "/api/mcp-filters" \
  "/api/filters" \
  "/api/gateway/filters" \
  "/api/mcp-gateway/filters"
do
  if [ "$path" = "/api/mcp-webhook-validations" ]; then
    # Obot only invokes a webhook validation for servers it is attached to.
    # Tool selectors alone do not attach it. selector=* is the global index;
    # mcpServerCatalogEntry binds this vault entry.
    PAYLOAD="{
      \"name\": \"mai-deny-memory-ingest\",
      \"url\": \"${FILTER_URL}\",
      \"secret\": \"${FILTER_SECRET}\",
      \"resources\": [
        { \"type\": \"selector\", \"id\": \"*\" },
        { \"type\": \"mcpServerCatalogEntry\", \"id\": \"${ENTRY_ID}\" }
      ],
      \"selectors\": [
        { \"method\": \"tools/call\", \"identifiers\": [\"memory_ingest\"] }
      ]
    }"
  else
    PAYLOAD="{
      \"name\": \"mai-deny-memory-ingest\",
      \"url\": \"${FILTER_URL}\",
      \"secret\": \"${FILTER_SECRET}\",
      \"selectors\": {
        \"mcpToolCallMethods\": [\"tools/call\"],
        \"mcpToolNames\": [\"memory_ingest\"]
      }
    }"
  fi
  RESP="$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:${OBOT_PORT}${path}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>/dev/null || echo -e '\n000')"
  CODE="$(printf '%s' "$RESP" | tail -n1)"
  BODY="$(printf '%s' "$RESP" | sed '$d')"
  echo "POST ${path} → HTTP ${CODE}"
  echo "$BODY" | head -c 500
  echo
  if [[ "$CODE" =~ ^2 ]]; then
    FILTER_REGISTERED=1
    FILTER_PATH_USED="$path"
    CONFIGURED_FLAG="$(printf '%s' "$BODY" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  d={}
v=d.get("configured")
if v is True or str(v).lower()=="true":
  print("1")
elif v is False or str(v).lower()=="false":
  print("0")
else:
  print("unknown")
' 2>/dev/null || echo "unknown")"
    if [ "$CONFIGURED_FLAG" = "1" ]; then
      FILTER_CONFIGURED=1
    fi
    echo "webhook validation posted via ${path} configured_flag=${CONFIGURED_FLAG}"
    break
  fi
done

# Create returns configured=false. Obot then starts a containerized
# http-webhook-mcp-converter (~3s on Docker Desktop). Probing memory_ingest
# before that container is up is a setup miss, not a corpus result.
if [ "$FILTER_REGISTERED" -eq 1 ] && [ "$FILTER_CONFIGURED" -ne 1 ]; then
  echo "== wait for webhook validation configured + converter container =="
  for i in $(seq 1 30); do
    LIST="$(curl -sS -H "Authorization: Bearer $TOKEN" \
      "http://127.0.0.1:${OBOT_PORT}/api/mcp-webhook-validations" 2>/dev/null || true)"
    READY="$(printf '%s' "$LIST" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  d={}
items=d.get("items") or []
print("1" if any(it.get("configured") is True for it in items) else "0")
' 2>/dev/null || echo 0)"
    CONVERTER="$(docker ps --format '{{.Image}} {{.Status}}' | grep 'http-webhook-mcp-converter' || true)"
    echo "wait ${i}: api_configured=${READY} converter=${CONVERTER:-absent}"
    if [ "$READY" = "1" ] && [ -n "$CONVERTER" ]; then
      FILTER_CONFIGURED=1
      # Converter process is up; give the MCP session a moment before the probe.
      sleep 5
      break
    fi
    sleep 2
  done
fi

if [ "$FILTER_REGISTERED" -eq 1 ] || [ -n "${OBOT_MCP_URL_DENY:-}" ]; then
  echo "== measure obot best_config (precondition deny, then one corpus run) =="
  mai_seed_shared_vault "$SHARED"
  export OBOT_MCP_URL_DENY="${OBOT_MCP_URL_DENY:-$CONNECT_URL}"
  unset OBOT_MCP_URL || true
  # run-peer: if direct memory_ingest is still allowed → pending (config not active).
  # If denied → run 12 attacks + 14 benign once and keep the score (do not iterate to 0).
  node "$HARNESS/run-peer.mjs" obot best_config | tee "$RESULTS_DIR/obot_best_config.json"
  node "$HARNESS/stamp-peer-version.mjs" "$RESULTS_DIR/obot_best_config.json" \
    --peer obot --image "$OBOT_IMAGE" --digest "${OBOT_DIGEST:-}"

  python3 - <<PY
import json
from pathlib import Path
p = Path("$RESULTS_DIR/obot_best_config.json")
d = json.loads(p.read_text())
pre = d.get("precondition") or {}
# Stamp registration metadata alongside precondition for rerunners.
d["webhook_registration"] = {
  "path": "${FILTER_PATH_USED}" or None,
  "registered": ${FILTER_REGISTERED} == 1,
  "api_configured_flag": ${FILTER_CONFIGURED} == 1,
  "filter_url": "${FILTER_URL}",
}
if "precondition" not in d:
  d["precondition"] = {
    "denied": False,
    "active": False,
    "method": "not_run",
    "detail": "run-peer did not emit precondition",
    "probe_outside_corpus": True,
  }
p.write_text(json.dumps(d, indent=2) + "\n")
status = d.get("status")
denied = (d.get("precondition") or {}).get("denied")
eff = d.get("attacks_effectuated")
print(f"ci-obot-peer: best_config status={status} precondition.denied={denied} effectuated={eff}", flush=True)
if status == "pending":
  print("ci-obot-peer: configuration not active — fix adapter, then one re-run (do not tune toward 0)", flush=True)
elif status == "measured":
  print("ci-obot-peer: deny precondition passed; published one-shot corpus result as-is", flush=True)
PY
else
  echo "ci-obot-peer: could not register webhook validation via API — writing pending best_config" >&2
  echo "  Manual: POST /api/mcp-webhook-validations → ${FILTER_URL} (secret=${FILTER_SECRET}), selectors tools/call memory_ingest; configure system MCP adapter; confirm one direct memory_ingest is refused; then OBOT_MCP_URL_DENY=\$CONNECT_URL re-run once." >&2
  write_pending obot_best_config best_config OBOT_MCP_URL_DENY \
    "Defaults measured on ${HOST_LABEL}. Best-config needs Obot native mcp-webhook-validations deny on memory_ingest (helper at ${FILTER_URL}). Precondition: one direct memory_ingest outside the corpus must be refused before measuring. pending ≠ not_offered. Do not use deny-tools-mcp."
  python3 - <<PY
import json
from pathlib import Path
p = Path("$RESULTS_DIR/obot_best_config.json")
d = json.loads(p.read_text())
d["precondition"] = {
  "denied": False,
  "active": False,
  "method": "not_run",
  "detail": "pending: configuration not active — webhook validation not registered via API",
  "probe_outside_corpus": True,
}
d["webhook_registration"] = {
  "path": None,
  "registered": False,
  "api_configured_flag": False,
  "filter_url": "${FILTER_URL}",
}
p.write_text(json.dumps(d, indent=2) + "\n")
PY
fi

echo "wrote $RESULTS_DIR/obot_*.json"
echo "note: equal-arm Obsidian vault · same 12 attacks · same 14 benign · platform=${HOST_LABEL}"
echo "note: best-config = native webhook validation; precondition deny outside corpus; one corpus run; not deny-tools-mcp"
