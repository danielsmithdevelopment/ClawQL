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
    kill "${OLD_PID}" || true
    sleep 1
  fi
  rm -f "${PID_FILE}"
fi

# Clean vault for this task (Option A — delete and recreate).
rm -rf "${VAULT_PATH}"
mkdir -p "${VAULT_PATH}/Memory"

export CLAWQL_OBSIDIAN_VAULT_PATH="${VAULT_PATH}"
export CLAWQL_ENABLE_MEMORY="${CLAWQL_ENABLE_MEMORY:-1}"
export CLAWQL_ONTOLOGY_DB="${CLAWQL_ONTOLOGY_DB:-1}"
export CLAWQL_ONTOLOGY_LLM_EXTRACTION="${CLAWQL_ONTOLOGY_LLM_EXTRACTION:-0}"
export CLAWQL_MCP_STATELESS="${CLAWQL_MCP_STATELESS:-0}"
export CLAWQL_MCP_PROTOCOL_VERSION="${CLAWQL_MCP_PROTOCOL_VERSION:-2025-11-25}"
export PORT
export HOST="${HOST:-127.0.0.1}"

echo "Vault: ${VAULT_PATH}"
echo "Starting clawql-mcp-http on ${HOST}:${PORT}"

cd "${ROOT}"
# Prefer local workspace binary; fall back to npx published package.
if [[ -x "${ROOT}/bin/clawql-mcp-http.mjs" ]]; then
  nohup node "${ROOT}/bin/clawql-mcp-http.mjs" >"${LOG_FILE}" 2>&1 &
else
  nohup npx -y clawql-mcp-http >"${LOG_FILE}" 2>&1 &
fi
CLAWQL_PID=$!
echo "${CLAWQL_PID}" >"${PID_FILE}"
echo "ClawQL MCP started with PID ${CLAWQL_PID} (log: ${LOG_FILE})"

# Wait for healthz
for i in $(seq 1 30); do
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
