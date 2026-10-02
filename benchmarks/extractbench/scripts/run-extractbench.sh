#!/usr/bin/env bash
# Convenience: apply overlay + run ExtractBench with cost-safe defaults.
# Usage:
#   ./run-extractbench.sh /path/to/ExtractBench --test
#   ./run-extractbench.sh /path/to/ExtractBench --group short
#   ./run-extractbench.sh /path/to/ExtractBench
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EB_ROOT="${1:?ExtractBench checkout path required}"
shift || true

PIPELINE="${CLAWQL_EXTRACTBENCH_PIPELINE:-clawql_idp_qwen_extract}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

python3 "$SCRIPT_DIR/apply_clawql_provider.py" --extractbench "$EB_ROOT"

cd "$EB_ROOT"
if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — set CLAWQL_MCP_URL and QWEN35_SERVER_URL"
fi

export CLAWQL_REPO_ROOT="$ROOT"
if [[ -z "${CLAWQL_MCP_URL:-}" ]]; then
  export CLAWQL_MCP_URL="http://127.0.0.1:8080/mcp"
fi

echo "Running: uv run extract-bench run $PIPELINE $*"
exec uv run extract-bench run "$PIPELINE" "$@"
