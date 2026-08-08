#!/usr/bin/env bash
# Phase A — single firm-knowledge task, both arms (Sonnet).
# Requires: ANTHROPIC_API_KEY, applied adapter, Podman sandbox image.
set -euo pipefail

HARVEY_LABS="${HARVEY_LABS:?Set HARVEY_LABS to the harvey-labs checkout}"
TASK="${1:-firm-knowledge/tasks/001}"
MAX_TURNS="${MAX_TURNS:-15}"
CLAWQL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ANTHROPIC_API_KEY is required" >&2
  exit 1
fi

python3 "${CLAWQL_ROOT}/integrations/harvey-labs/scripts/apply_clawql_adapter.py" \
  --harvey-labs "${HARVEY_LABS}"

echo "== Arm A baseline =="
(
  cd "${HARVEY_LABS}"
  uv run python -m harness.run \
    --model anthropic/claude-sonnet-4-6 \
    --task "${TASK}" \
    --max-turns "${MAX_TURNS}"
)

echo "== Start ClawQL MCP =="
bash "${CLAWQL_ROOT}/scripts/start-clawql-for-lab.sh" "${TASK}" 8080
export CLAWQL_MCP_URL="${CLAWQL_MCP_URL:-http://127.0.0.1:8080/mcp}"

echo "== Arm B ClawQL =="
(
  cd "${HARVEY_LABS}"
  # Cap matters only for ultra-cheap smoke; unset for real Phase A.
  CLAWQL_LAB_MAX_MATTERS="${CLAWQL_LAB_MAX_MATTERS:-0}" \
  uv run python -m harness.run \
    --model clawql/claude-sonnet-4-6 \
    --task "${TASK}" \
    --max-turns "${MAX_TURNS}"
)

echo "Phase A agent runs complete. Evaluate with evaluation.run_eval using the printed run IDs."
