#!/usr/bin/env bash
# GHA helper for §13.5 Cost Explorer three-arm CSV export (fail-closed).
# Expects AWS credentials already in the environment (static keys, CLAWQL_CE_*,
# or GitHub OIDC assumed-role). Optional INPUT_*/PAYLOAD_* date overrides.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -z "${CLAWQL_CE_ACCESS_KEY_ID:-}" ] && [ -n "${CLAWQL_AWS_ACCESS_KEY_ID:-}" ]; then
  export CLAWQL_CE_ACCESS_KEY_ID="${CLAWQL_AWS_ACCESS_KEY_ID}"
  export CLAWQL_CE_SECRET_ACCESS_KEY="${CLAWQL_AWS_SECRET_ACCESS_KEY}"
  echo "Mapped CLAWQL_AWS_* → CLAWQL_CE_* for export"
fi

START="${INPUT_START:-}"
END="${INPUT_END:-}"
if [ -z "${START}" ]; then START="${PAYLOAD_START:-}"; fi
if [ -z "${END}" ]; then END="${PAYLOAD_END:-}"; fi
if [ -z "${START}" ] || [ -z "${END}" ]; then
  END="$(date -u +%Y-%m-%d)"
  START="$(date -u -d 'yesterday' +%Y-%m-%d)"
fi
export CLAWQL_S13_START="${START}"
export CLAWQL_S13_END="${END}"
echo "CE window ${CLAWQL_S13_START} .. ${CLAWQL_S13_END} (exclusive end)"

mkdir -p artifacts/ce-export
bash infra/aws-celld-burst/loadtest/export-cost-explorer-arms.sh artifacts/ce-export
node infra/aws-celld-burst/loadtest/write-ce-export-summary.mjs artifacts/ce-export
