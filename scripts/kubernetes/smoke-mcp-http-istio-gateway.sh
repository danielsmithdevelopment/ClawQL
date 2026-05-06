#!/usr/bin/env bash
set -euo pipefail
# Smoke-test Streamable MCP HTTP through Istio ingress (:80) — same path Cursor uses.
#
# Prerequisites:
#   - curl
#   - make local-k8s-up (or equivalent) with Istio gateway + clawql-mcp-http Ready
#
# Env:
#   CLAWQL_MCP_HTTP_URL — default http://127.0.0.1/mcp (use 127.0.0.1 on Docker Desktop
#     macOS when `localhost` resolves to ::1 and nothing listens on [::1]:80)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

URL="${CLAWQL_MCP_HTTP_URL:-http://127.0.0.1/mcp}"

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

kubectl_ctx() {
  if [[ -n "${KUBE_CONTEXT:-}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" "$@"
  else
    kubectl "$@"
  fi
}

if kubectl_ctx cluster-info >/dev/null 2>&1; then
  echo "==> kubectl context: ${KUBE_CONTEXT:-current} (optional sanity)"
  kubectl_ctx -n istio-ingress get svc clawql-mcp-ingress 2>/dev/null || true
  kubectl_ctx -n clawql get endpoints clawql-mcp-http 2>/dev/null || true
fi

body="$(mktemp)"
hdr="$(mktemp)"
trap 'rm -f "${body}" "${hdr}"' EXIT

echo "==> POST initialize → ${URL}"
code="$(curl -sS -o "${body}" -w "%{http_code}" -D "${hdr}" -X POST "${URL}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}')"

if [[ "${code}" != "200" ]]; then
  echo "ERROR: expected HTTP 200, got ${code}"
  echo "--- response headers ---"
  cat "${hdr}"
  echo "--- body ---"
  cat "${body}"
  exit 1
fi

if ! grep -qi '^mcp-session-id:' "${hdr}"; then
  echo "ERROR: missing mcp-session-id response header (Streamable HTTP handshake)"
  cat "${hdr}"
  exit 1
fi

echo "OK: MCP Streamable HTTP initialize via ${URL} (status ${code}, session header present)."
echo "    If Cursor still fails, set MCP url to this same string in ~/.cursor/mcp.json or workspace .cursor/mcp.json."
