#!/usr/bin/env bash
# Start clawql-inference for Harvey LAB (OpenAI-compat /v1 + call-store).
# Same flywheel pattern as OpenBench / ExtractBench: harness hits the gateway,
# not raw MLX/Ollama. Gateway proxies upstream and appends JSONL traces.
#
# Usage:
#   ./start-clawql-inference-for-lab.sh [port] [run_id]
#   CLAWQL_LAB_RUN_ID=harvey-lab-local-001 ./start-clawql-inference-for-lab.sh 8091
#
# Upstream:
#   Agent (Nemotron MLX): CLAWQL_OPENAI_BASE_URL → http://127.0.0.1:8081/v1
#   Judge (Ollama):       OLLAMA_BASE_URL → http://127.0.0.1:11434
#
# Call-store:
#   $CLAWQL_HOME/HarveyLAB/call-store/calls.jsonl
#   runs/<run_id>/calls.jsonl when CLAWQL_INFERENCE_STORE_RUN_SCOPED=1
set -euo pipefail

PORT="${1:-8091}"
RUN_ID="${2:-${CLAWQL_LAB_RUN_ID:-harvey-lab-local}}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if [[ ! -f "${ROOT}/packages/clawql-inference/package.json" ]]; then
  echo "ERROR: clawql-inference not found under ${ROOT}" >&2
  exit 1
fi

HOME_DIR="${CLAWQL_HOME:-$HOME/.clawql}"
STORE_DEFAULT="$HOME_DIR/HarveyLAB/call-store/calls.jsonl"
STORE="${CLAWQL_INFERENCE_STORE_PATH:-$STORE_DEFAULT}"
mkdir -p "$(dirname "$STORE")"
mkdir -p "$HOME_DIR/Inference"
mkdir -p "$HOME_DIR/HarveyLAB/call-store/runs"

export CLAWQL_HOME="$HOME_DIR"
export CLAWQL_INFERENCE_STORE="${CLAWQL_INFERENCE_STORE:-jsonl}"
export CLAWQL_INFERENCE_STORE_PATH="$STORE"
export CLAWQL_INFERENCE_STORE_RUN_SCOPED="${CLAWQL_INFERENCE_STORE_RUN_SCOPED:-1}"
export CLAWQL_INFERENCE_PORT="$PORT"
export CLAWQL_LAB_RUN_ID="$RUN_ID"
export CLAWQL_INFERENCE_RUN_ID="$RUN_ID"

# MLX Nemotron as OpenAI-compatible upstream (provider id: openai/…)
export CLAWQL_OPENAI_BASE_URL="${CLAWQL_OPENAI_BASE_URL:-http://127.0.0.1:8081/v1}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-local}"
# Ollama for judge (provider id: ollama/…)
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

# Do not let OpenRouter steal traffic.
unset OPENROUTER_API_KEY 2>/dev/null || true

if [[ -f "$HOME_DIR/Inference/policy.yaml" ]]; then
  export CLAWQL_INFERENCE_POLICY_MANIFEST="${CLAWQL_INFERENCE_POLICY_MANIFEST:-$HOME_DIR/Inference/policy.yaml}"
elif [[ -f "$ROOT/examples/inference/policy.yaml" ]]; then
  cp "$ROOT/examples/inference/policy.yaml" "$HOME_DIR/Inference/policy.yaml"
  export CLAWQL_INFERENCE_POLICY_MANIFEST="$HOME_DIR/Inference/policy.yaml"
fi

unset PORT 2>/dev/null || true

echo "Starting clawql-inference for Harvey LAB on :${CLAWQL_INFERENCE_PORT}"
echo "  CLAWQL_INFERENCE_URL=http://127.0.0.1:${CLAWQL_INFERENCE_PORT}/v1"
echo "  call-store(shared)=$STORE"
echo "  call-store(run-scoped)=${CLAWQL_INFERENCE_STORE_RUN_SCOPED} → $(dirname "$STORE")/runs/${RUN_ID}/calls.jsonl"
echo "  CLAWQL_OPENAI_BASE_URL=$CLAWQL_OPENAI_BASE_URL  (MLX agent)"
echo "  OLLAMA_BASE_URL=$OLLAMA_BASE_URL  (judge)"

cd "$ROOT"
if [[ -f "$ROOT/bin/clawql.mjs" ]]; then
  exec node "$ROOT/bin/clawql.mjs" inference serve --port "$CLAWQL_INFERENCE_PORT"
fi

if [[ -x "$ROOT/node_modules/.bin/clawql-inference" ]]; then
  exec env CLAWQL_INFERENCE_PORT="$CLAWQL_INFERENCE_PORT" "$ROOT/node_modules/.bin/clawql-inference"
fi

echo "ERROR: could not find clawql inference serve entry. Build ClawQL first." >&2
exit 1
