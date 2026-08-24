#!/usr/bin/env bash
# Chat-level health probe (GET /v1/models is NOT enough after metal::malloc).
#
# Hits clawql-inference by default (same path as the harness). A 502 with
# "fetch failed" means MLX generate is dead even if /v1/models is 200.
set -euo pipefail

BASE="${CLAWQL_LAB_AGENT_BASE_URL:-http://127.0.0.1:8091/v1}"
MODEL="${LAB_NEMOTRON_MODEL:-openai/mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit}"
TIMEOUT="${CLAWQL_LAB_CHAT_PROBE_TIMEOUT:-45}"
URL="${BASE%/}/chat/completions"

body="$(curl -sS -m "${TIMEOUT}" -w '\n%{http_code}' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${CLAWQL_LAB_LOCAL_API_KEY:-local}" \
  -d "$(printf '%s' "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":4}")" \
  "${URL}" 2>&1)" || {
  echo "FAIL chat probe: curl error to ${URL}" >&2
  echo "${body}" >&2
  exit 1
}

http="${body##*$'\n'}"
payload="${body%$'\n'*}"
if [[ "${http}" != "200" ]]; then
  echo "FAIL chat probe HTTP ${http} from ${URL}" >&2
  echo "${payload}" | head -c 800 >&2
  echo >&2
  exit 1
fi
if echo "${payload}" | grep -qi 'fetch failed\|resource limit\|metal::malloc'; then
  echo "FAIL chat probe: upstream still reporting Metal/fetch failure" >&2
  echo "${payload}" | head -c 800 >&2
  echo >&2
  exit 1
fi
echo "OK chat probe ${URL} HTTP ${http}"
