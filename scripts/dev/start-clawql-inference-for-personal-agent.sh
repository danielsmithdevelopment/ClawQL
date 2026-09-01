#!/usr/bin/env bash
# Start clawql-inference for the personal Hermes/Cline stack.
#
# Routes openai/ornith-1.5-35b-a3b (and bare ornith-1.5-35b-a3b) to local MLX :8082.
# Leaves Harvey Nemotron on :8081 alone. Does not kill an existing :8091 unless
# CLAWQL_REPLACE_LISTENERS=1.
#
# Usage:
#   ./scripts/dev/start-clawql-inference-for-personal-agent.sh [port]
set -euo pipefail

PORT="${1:-${CLAWQL_INFERENCE_PORT:-8091}}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOME_DIR="${CLAWQL_HOME:-}"
if [[ -z "$HOME_DIR" ]]; then
  if [[ -d "${HOME}/.ClawQL" ]]; then HOME_DIR="${HOME}/.ClawQL"
  elif [[ -d "${HOME}/.clawql" ]]; then HOME_DIR="${HOME}/.clawql"
  else HOME_DIR="${HOME}/.ClawQL"
  fi
fi
STORE="${CLAWQL_INFERENCE_STORE_PATH:-$HOME_DIR/PersonalAgent/call-store/calls.jsonl}"
mkdir -p "$(dirname "$STORE")"

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
      echo "Harvey/ExtractBench inference may still be bound here." >&2
      echo "Stop it, or run: CLAWQL_INFERENCE_PORT=8092 $0 8092" >&2
      echo "Or: CLAWQL_REPLACE_LISTENERS=1 $0" >&2
      exit 1
    fi
  fi
fi

export CLAWQL_HOME="$HOME_DIR"
export CLAWQL_INFERENCE_STORE="${CLAWQL_INFERENCE_STORE:-jsonl}"
export CLAWQL_INFERENCE_STORE_PATH="$STORE"
export CLAWQL_INFERENCE_PORT="$PORT"
export CLAWQL_MLX_BASE_URL="${CLAWQL_MLX_BASE_URL:-http://127.0.0.1:8082/v1}"
export CLAWQL_MLX_MODEL="${CLAWQL_MLX_MODEL:-$HOME/models/ornith-1.5-35b-a3b}"
export MLX_API_KEY="${MLX_API_KEY:-local}"
# Keep Nemotron fallback on the openai provider if :8081 is up.
export CLAWQL_OPENAI_BASE_URL="${CLAWQL_OPENAI_BASE_URL:-http://127.0.0.1:8081/v1}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-local}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
export CLAWQL_LOKI_PUSH_URL="${CLAWQL_LOKI_PUSH_URL:-http://127.0.0.1:3100/loki/api/v1/push}"
export CLAWQL_LOKI_INFERENCE_JOB="${CLAWQL_LOKI_INFERENCE_JOB:-clawql-inference}"
unset OPENROUTER_API_KEY 2>/dev/null || true
unset PORT 2>/dev/null || true

echo "Starting clawql-inference for personal agent on :${CLAWQL_INFERENCE_PORT}"
echo "  CLAWQL_INFERENCE_URL=http://127.0.0.1:${CLAWQL_INFERENCE_PORT}/v1"
echo "  CLAWQL_MLX_BASE_URL=$CLAWQL_MLX_BASE_URL  (Ornith)"
echo "  CLAWQL_MLX_MODEL=$CLAWQL_MLX_MODEL"
echo "  CLAWQL_OPENAI_BASE_URL=$CLAWQL_OPENAI_BASE_URL  (Nemotron fallback)"
echo "  call-store=$STORE"
echo "  CLAWQL_LOKI_PUSH_URL=$CLAWQL_LOKI_PUSH_URL (inference stream job=${CLAWQL_LOKI_INFERENCE_JOB})"

cd "$ROOT"
if [[ -f "$ROOT/bin/clawql.mjs" ]]; then
  exec node "$ROOT/bin/clawql.mjs" inference serve --port "$CLAWQL_INFERENCE_PORT"
fi

echo "ERROR: could not find clawql inference serve entry. Build ClawQL first." >&2
exit 1
