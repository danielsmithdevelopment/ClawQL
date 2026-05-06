#!/usr/bin/env bash
set -euo pipefail

# Smoke-check local ingress UI hosts exposed by local-k8s-up.
# Fails fast when a route returns an unexpected status code or known transport error body.
#
# Usage:
#   bash scripts/kubernetes/smoke-localhost-uis.sh
#
# Optional env:
#   CLAWQL_UI_SMOKE_TIMEOUT=8   # curl timeout seconds (default 8)

TIMEOUT="${CLAWQL_UI_SMOKE_TIMEOUT:-8}"

check_url() {
  local name="$1"
  local url="$2"
  local expected_regex="$3"

  local body_file
  body_file="$(mktemp)"
  local code
  code="$(curl -sS -m "${TIMEOUT}" -o "${body_file}" -w "%{http_code}" "${url}")"
  local body_head
  body_head="$(sed -n '1,2p' "${body_file}" | tr '\n' ' ')"

  if [[ ! "${code}" =~ ${expected_regex} ]]; then
    echo "FAIL ${name}: ${url} returned HTTP ${code} (expected ${expected_regex})"
    echo "Body: ${body_head}"
    rm -f "${body_file}"
    return 1
  fi

  if rg -qi "upstream connect error|no healthy upstream|TLS_error|connection refused|certificate has expired" "${body_file}"; then
    echo "FAIL ${name}: ${url} returned transport failure body"
    echo "Body: ${body_head}"
    rm -f "${body_file}"
    return 1
  fi

  echo "OK   ${name}: HTTP ${code}"
  rm -f "${body_file}"
}

echo "==> Localhost UI smoke tests"
check_url "dashboard-ui" "http://clawql.localhost/" "^(200)$"
check_url "docs-ui" "http://docs.localhost/" "^(200)$"
check_url "mcp-health" "http://clawql-mcp.localhost/healthz" "^(200)$"
check_url "flink-ui" "http://flink.localhost/" "^(200)$"
check_url "onyx-ui" "http://onyx.localhost/app" "^(200|302|307)$"
check_url "paperless-ui" "http://paperless.localhost/" "^(200|302|307)$"
check_url "stirling-ui" "http://stirling.localhost/" "^(200|302|307|401)$"
check_url "tika-ui" "http://tika.localhost/" "^(200)$"
check_url "gotenberg-health" "http://gotenberg.localhost/health" "^(200)$"
check_url "nats-ui" "http://nats.localhost/" "^(200)$"

echo "==> UI smoke tests OK"
