#!/usr/bin/env bash
# Smoke-test OpenClaw chat bridge + optional dashboard proxy.
#
# Local (default):
#   Terminal 1: cd dashboard && npm run openclaw:chat-bridge
#   Terminal 2: ./scripts/kubernetes/smoke-openclaw-chat-bridge.sh
#
# In-cluster (OpenClaw Helm sub-chart with chatBridge enabled):
#   kubectl port-forward -n clawql svc/clawql-mcp-http-openclaw 8787:8787 &
#   OPENCLAW_CHAT_URL=http://127.0.0.1:8787/v1/chat ./scripts/kubernetes/smoke-openclaw-chat-bridge.sh
#
# Dashboard proxy (local dev server):
#   CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL=http://127.0.0.1:8787/v1/chat npm run dev --prefix dashboard
#   TEST_DASHBOARD=1 ./scripts/kubernetes/smoke-openclaw-chat-bridge.sh
set -euo pipefail

CHAT_URL="${OPENCLAW_CHAT_URL:-http://127.0.0.1:8787/v1/chat}"
HEALTH_URL="${CHAT_URL%/v1/chat}/healthz"
DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:3040}"
TEST_DASHBOARD="${TEST_DASHBOARD:-0}"

echo "==> Chat bridge health: ${HEALTH_URL}"
curl -sf "${HEALTH_URL}" | grep -q '"ok":true' && echo "    OK"

echo "==> POST ${CHAT_URL}"
CHAT_BODY='{"message":"Reply with exactly the word: pong","threadId":"smoke-test"}'
CHAT_RESP="$(curl -sS -X POST "${CHAT_URL}" -H 'Content-Type: application/json' -d "${CHAT_BODY}")"
echo "${CHAT_RESP}" | head -c 600
echo ""

if echo "${CHAT_RESP}" | grep -q '"reply"'; then
  echo "==> Chat bridge: got reply (full path OK)"
elif echo "${CHAT_RESP}" | grep -q 'No API key found'; then
  echo ""
  echo "==> Wiring OK — OpenClaw agent reached but no LLM auth configured."
  echo "    Set a provider key (e.g. OPENROUTER_API_KEY in repo .env, or openclaw models auth paste-token)."
  echo "    For Kubernetes: --set-string openclaw.openrouterApiKey=... or openclaw.existingSecret."
else
  if echo "${CHAT_RESP}" | grep -q '"error"'; then
    echo "==> Chat bridge returned error (see above)" >&2
    exit 1
  fi
  echo "==> Unexpected chat response" >&2
  exit 1
fi

if [[ "${TEST_DASHBOARD}" == "1" ]]; then
  echo "==> Dashboard config: ${DASHBOARD_URL}/api/agent/config"
  curl -sf "${DASHBOARD_URL}/api/agent/config" | grep -q '"openclawConfigured":true' && echo "    openclawConfigured=true"
  echo "==> Dashboard proxy: POST ${DASHBOARD_URL}/api/agent/chat"
  DASH_RESP="$(curl -sS -X POST "${DASHBOARD_URL}/api/agent/chat" -H 'Content-Type: application/json' -d "${CHAT_BODY}")"
  echo "${DASH_RESP}" | head -c 600
  echo ""
  if echo "${DASH_RESP}" | grep -qE '"reply"|No API key found'; then
    echo "==> Dashboard proxy OK (reached OpenClaw upstream)"
  elif echo "${DASH_RESP}" | grep -q '"demo":true'; then
    echo "==> Dashboard still in demo mode — set CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL" >&2
    exit 1
  else
    echo "==> Dashboard proxy failed" >&2
    exit 1
  fi
fi

echo "==> smoke-openclaw-chat-bridge OK"
