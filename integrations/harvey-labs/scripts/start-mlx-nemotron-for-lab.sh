#!/usr/bin/env bash
# Start or restart mlx_lm.server (Nemotron) for Harvey LAB on :8081.
#
# Apple Silicon `resource_limit` (~499000) is a **count of live Metal buffers**,
# not RAM. set_memory_limit / bigger unified memory does not raise it. After a
# metal::malloc abort the HTTP listener can still serve GET /v1/models while
# chat is dead — callers must probe chat, then restart this process.
#
# Usage:
#   bash integrations/harvey-labs/scripts/start-mlx-nemotron-for-lab.sh
#   CLAWQL_LAB_RESTART_MLX=1 bash …/start-mlx-nemotron-for-lab.sh   # kill :8081 first
set -euo pipefail

PORT="${CLAWQL_LAB_MLX_PORT:-8081}"
HOST="${CLAWQL_LAB_MLX_HOST:-127.0.0.1}"
MODEL="${CLAWQL_LAB_MLX_MODEL:-mlx-community/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-4bit}"
VENV="${CLAWQL_LAB_MLX_VENV:-$HOME/ClawQL-harvey-lab/.venv-mlx}"
LOG="${CLAWQL_LAB_MLX_LOG:-/tmp/clawql-mlx-nemotron.log}"
PID_FILE="${CLAWQL_LAB_MLX_PID_FILE:-/tmp/clawql-mlx-nemotron.pid}"
# Keep few KV caches — 10 large prompts is how we exhausted 499000 buffers.
CACHE_SIZE="${CLAWQL_LAB_MLX_PROMPT_CACHE_SIZE:-2}"
CACHE_BYTES="${CLAWQL_LAB_MLX_PROMPT_CACHE_BYTES:-2147483648}"

if [[ ! -x "${VENV}/bin/mlx_lm.server" ]]; then
  echo "ERROR: mlx_lm.server not found at ${VENV}/bin/mlx_lm.server" >&2
  echo "  Set CLAWQL_LAB_MLX_VENV to the venv that has mlx_lm." >&2
  exit 1
fi

free_port() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local pids
  pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi
  echo "Stopping MLX on :${PORT} (pids: ${pids})"
  # shellcheck disable=SC2086
  kill ${pids} 2>/dev/null || true
  sleep 2
  pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill -KILL ${pids} 2>/dev/null || true
    sleep 1
  fi
}

if [[ "${CLAWQL_LAB_RESTART_MLX:-0}" == "1" ]] || [[ "${1:-}" == "--restart" ]]; then
  free_port
  rm -f "${PID_FILE}"
elif command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "MLX already listening on :${PORT} (pass --restart or CLAWQL_LAB_RESTART_MLX=1 to recycle)"
    curl -fsS -m 5 "http://${HOST}:${PORT}/v1/models" >/dev/null
    echo "MLX /v1/models OK"
    exit 0
  fi
fi

mkdir -p "$(dirname "${LOG}")"
{
  echo ""
  echo "======== MLX start $(date -u +%Y-%m-%dT%H:%M:%SZ) model=${MODEL} cache_size=${CACHE_SIZE} cache_bytes=${CACHE_BYTES} ========"
} >>"${LOG}"

echo "Starting mlx_lm.server ${MODEL} on ${HOST}:${PORT}"
nohup "${VENV}/bin/mlx_lm.server" \
  --model "${MODEL}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --temp 0.0 \
  --decode-concurrency 1 \
  --prompt-concurrency 1 \
  --prompt-cache-size "${CACHE_SIZE}" \
  --prompt-cache-bytes "${CACHE_BYTES}" \
  >>"${LOG}" 2>&1 &
echo $! >"${PID_FILE}"
echo "MLX pid $(cat "${PID_FILE}") log ${LOG}"

for _ in $(seq 1 90); do
  if curl -fsS -m 3 "http://${HOST}:${PORT}/v1/models" >/dev/null 2>&1; then
    echo "MLX ready at http://${HOST}:${PORT}/v1"
    exit 0
  fi
  sleep 2
done
echo "ERROR: MLX did not become ready on :${PORT} within 180s (see ${LOG})" >&2
exit 1
