#!/usr/bin/env bash
# Start ClawQL MCP HTTP for the personal Hermes/Cline stack.
#
# Default :8080 (do not use Harvey LAB's :8082 — that collides with Ornith MLX).
# Does not touch :8091 (inference) or :8081 (Nemotron).
#
# Usage:
#   ./scripts/dev/start-clawql-for-personal-agent.sh [port]
set -euo pipefail

PORT="${1:-8080}"
PID_FILE="${CLAWQL_PERSONAL_PID_FILE:-/tmp/clawql-personal-mcp.pid}"
LOG_FILE="${CLAWQL_PERSONAL_MCP_LOG:-/tmp/clawql-personal-mcp.log}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VAULT_PATH="${CLAWQL_OBSIDIAN_VAULT_PATH:-$HOME/.ClawQL}"

if command -v lsof >/dev/null 2>&1; then
  STALE="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "${STALE}" ]]; then
    echo "ERROR: :${PORT} already in use (pids: ${STALE})." >&2
    echo "Stop that listener or pick another port. Will not kill Harvey/ExtractBench processes." >&2
    exit 1
  fi
fi

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "Stopping previous personal-agent MCP (pid ${OLD_PID})"
    kill "${OLD_PID}" 2>/dev/null || true
    sleep 1
  fi
  rm -f "${PID_FILE}"
fi

mkdir -p "${VAULT_PATH}/Memory"

export CLAWQL_OBSIDIAN_VAULT_PATH="${VAULT_PATH}"
export CLAWQL_ENABLE_MEMORY="${CLAWQL_ENABLE_MEMORY:-1}"
export CLAWQL_ENABLE_DATA="${CLAWQL_ENABLE_DATA:-1}"
export CLAWQL_ENABLE_WEB="${CLAWQL_ENABLE_WEB:-1}"
export CLAWQL_MCP_STATELESS="${CLAWQL_MCP_STATELESS:-0}"
export PORT
export HOST="${HOST:-127.0.0.1}"
export CLAWQL_LOKI_PUSH_URL="${CLAWQL_LOKI_PUSH_URL:-http://127.0.0.1:3100/loki/api/v1/push}"
export CLAWQL_LOKI_JOB="${CLAWQL_LOKI_JOB:-clawql-audit}"

echo "Vault: ${VAULT_PATH} (memory_ingest/recall → ${VAULT_PATH}/Memory)"
echo "Starting clawql-mcp-http on ${HOST}:${PORT}"
echo "  CLAWQL_ENABLE_DATA=${CLAWQL_ENABLE_DATA} (data_query + clawql_sql alias)"
echo "  CLAWQL_ENABLE_WEB=${CLAWQL_ENABLE_WEB} (web_search)"
echo "  CLAWQL_LOKI_PUSH_URL=${CLAWQL_LOKI_PUSH_URL} (audit stream job=${CLAWQL_LOKI_JOB})"

if [[ ! -f "${ROOT}/dist/server-http.js" ]]; then
  echo "ERROR: ${ROOT}/dist/server-http.js missing. Run: npm run build" >&2
  exit 1
fi

cd "${ROOT}"
nohup node "${ROOT}/bin/clawql-mcp-http.mjs" >"${LOG_FILE}" 2>&1 &
echo $! >"${PID_FILE}"
echo "pid $(cat "${PID_FILE}")  log ${LOG_FILE}"
echo "MCP URL: http://${HOST}:${PORT}/mcp"
