#!/usr/bin/env bash
# Start Ornith MLX on :8082 for the personal Hermes/Cline stack.
#
# Metal on the Mini dies if mlx_lm keeps many KV prompt-cache sequences or
# batches title-generation with the main chat (see: metal::malloc resource
# limit 499000). Defaults below are conservative: one cache slot, no batching.
#
# Does not touch :8080 (MCP), :8091 (inference), or Hermes.
#
# Usage:
#   ./scripts/dev/start-ornith-mlx-for-personal-agent.sh
set -euo pipefail

PORT="${CLAWQL_MLX_PORT:-8082}"
MODEL="${CLAWQL_MLX_MODEL:-$HOME/models/ornith-1.5-35b-a3b}"
MLX_BIN="${CLAWQL_MLX_SERVER_BIN:-$HOME/ClawQL-harvey-lab/.venv-mlx/bin/mlx_lm.server}"

if [[ ! -x "$MLX_BIN" ]]; then
  echo "ERROR: mlx_lm.server not found at $MLX_BIN" >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  STALE="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -n "${STALE}" ]]; then
    if [[ "${CLAWQL_REPLACE_LISTENERS:-0}" == "1" ]]; then
      echo "CLAWQL_REPLACE_LISTENERS=1 — stopping pids ${STALE} on :${PORT}"
      # shellcheck disable=SC2086
      kill ${STALE} 2>/dev/null || true
      sleep 1
    else
      echo "ERROR: :${PORT} already in use (pids: ${STALE})." >&2
      echo "Or: CLAWQL_REPLACE_LISTENERS=1 $0" >&2
      exit 1
    fi
  fi
fi

echo "Starting Ornith mlx_lm.server on :${PORT}"
echo "  model=$MODEL"
echo "  prompt-cache-size=1 decode-concurrency=1 prompt-concurrency=1 max-tokens=2048"

exec "$MLX_BIN" \
  --model "$MODEL" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --temp 0.6 \
  --max-tokens 2048 \
  --prompt-cache-size 1 \
  --prompt-cache-bytes 2GB \
  --decode-concurrency 1 \
  --prompt-concurrency 1
