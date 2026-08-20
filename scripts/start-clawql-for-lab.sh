#!/usr/bin/env bash
# Start ClawQL MCP HTTP for a Harvey LAB task with a task-scoped vault.
#
# Usage:
#   ./scripts/start-clawql-for-lab.sh [task_id] [port]
#
# Example:
#   ./scripts/start-clawql-for-lab.sh firm-knowledge/tasks/001 8080
set -euo pipefail

TASK_ID="${1:-default}"
PORT="${2:-8080}"
SAFE_TASK_ID="${TASK_ID//\//__}"
VAULT_PATH="${CLAWQL_LAB_VAULT_ROOT:-$HOME/.ClawQL/HarveyLABVault}/${SAFE_TASK_ID}"
PID_FILE="${CLAWQL_LAB_PID_FILE:-/tmp/clawql-lab.pid}"
LOG_FILE="${CLAWQL_LAB_LOG_FILE:-/tmp/clawql-mcp.log}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Stop previous LAB MCP if still running.
if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "Stopping previous ClawQL MCP (pid ${OLD_PID})"
    kill "${OLD_PID}" 2>/dev/null || true
    sleep 1
    if kill -0 "${OLD_PID}" 2>/dev/null; then
      echo "Force-killing ClawQL MCP (pid ${OLD_PID})"
      kill -KILL "${OLD_PID}" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "${PID_FILE}"
fi
# Also free the port if a stale listener remains (pid-file miss).
if command -v lsof >/dev/null 2>&1; then
  STALE_PIDS="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "${STALE_PIDS}" ]]; then
    echo "Freeing :${PORT} (stale pids: ${STALE_PIDS})"
    # shellcheck disable=SC2086
    kill -KILL ${STALE_PIDS} 2>/dev/null || true
    sleep 1
  fi
fi

export CLAWQL_OBSIDIAN_VAULT_PATH="${VAULT_PATH}"
export CLAWQL_ENABLE_MEMORY="${CLAWQL_ENABLE_MEMORY:-1}"
export CLAWQL_ENABLE_DATA="${CLAWQL_ENABLE_DATA:-1}"
export CLAWQL_DATA_ENGINE="${CLAWQL_DATA_ENGINE:-duckdb}"
export CLAWQL_DATA_PATH="${CLAWQL_DATA_PATH:-${VAULT_PATH}/lab/matters.duckdb}"
export CLAWQL_DATA_INGEST_ROOTS="${CLAWQL_DATA_INGEST_ROOTS:-/workspace:/tmp:${HOME}}"
export CLAWQL_ONTOLOGY_DB="${CLAWQL_ONTOLOGY_DB:-1}"
export CLAWQL_ONTOLOGY_LLM_EXTRACTION="${CLAWQL_ONTOLOGY_LLM_EXTRACTION:-0}"
# Bulk Markdown import for LAB DMS pre-seed (ingest_external_knowledge).
export CLAWQL_EXTERNAL_INGEST="${CLAWQL_EXTERNAL_INGEST:-1}"
export CLAWQL_MCP_STATELESS="${CLAWQL_MCP_STATELESS:-0}"
export CLAWQL_MCP_PROTOCOL_VERSION="${CLAWQL_MCP_PROTOCOL_VERSION:-2025-11-25}"
export PORT
export HOST="${HOST:-127.0.0.1}"

# Clean vault unless a prebuilt vault artifact was restored (shared setup).
if [[ "${CLAWQL_LAB_PRESERVE_VAULT:-0}" != "1" ]]; then
  rm -rf "${VAULT_PATH}"
fi
mkdir -p "${VAULT_PATH}/Memory"

echo "Vault: ${VAULT_PATH}"
echo "Starting clawql-mcp-http on ${HOST}:${PORT}"

# Prefer built local dist; the bin alone is not enough (imports dist/server-http.js).
# npx from the ClawQL repo root resolves the *local* bin — use a clean temp dir.
if [[ -f "${ROOT}/dist/server-http.js" ]]; then
  cd "${ROOT}"
  nohup node "${ROOT}/bin/clawql-mcp-http.mjs" >"${LOG_FILE}" 2>&1 &
  CLAWQL_PID=$!
else
  echo "dist/server-http.js missing — starting published clawql-mcp via npx (clean dir)"
  NPX_DIR="$(mktemp -d /tmp/clawql-mcp-npx.XXXXXX)"
  cd "${NPX_DIR}"
  # Package on npm is ``clawql-mcp`` (bin: clawql-mcp-http). Not ``clawql-mcp-http``.
  nohup npx --yes --package=clawql-mcp clawql-mcp-http >"${LOG_FILE}" 2>&1 &
  CLAWQL_PID=$!
fi
echo "${CLAWQL_PID}" >"${PID_FILE}"
echo "ClawQL MCP started with PID ${CLAWQL_PID} (log: ${LOG_FILE})"

# Wait for healthz
for i in $(seq 1 60); do
  if curl -sf "http://${HOST}:${PORT}/healthz" >/dev/null 2>&1; then
    echo "ClawQL ready at http://${HOST}:${PORT}/mcp"
    echo "export CLAWQL_MCP_URL=http://${HOST}:${PORT}/mcp"
    echo "export CLAWQL_OBSIDIAN_VAULT_PATH=${VAULT_PATH}"
    exit 0
  fi
  sleep 1
done

echo "ClawQL failed to become healthy. Last log lines:" >&2
tail -n 40 "${LOG_FILE}" >&2 || true
exit 1
