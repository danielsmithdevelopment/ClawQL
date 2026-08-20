#!/usr/bin/env bash
# Move pre-ts-v2 Harvey LAB call-store shards out of the training path.
#
# Usage:
#   bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh
#   bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh /path/to/calls.jsonl
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HOME_DIR="${CLAWQL_HOME:-$HOME/.clawql}"
STORE="${1:-${CLAWQL_INFERENCE_STORE_PATH:-$HOME_DIR/HarveyLAB/call-store/calls.jsonl}}"
QUAR="${HOME_DIR}/HarveyLAB/call-store/quarantine/python-duckdb-v1"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$QUAR"

if [[ -f "$STORE" ]]; then
  dest="${QUAR}/calls-${TS}.jsonl"
  mv "$STORE" "$dest"
  echo "Quarantined shared call-store → ${dest}"
fi

runs="${HOME_DIR}/HarveyLAB/call-store/runs"
if [[ -d "$runs" ]]; then
  for f in "$runs"/*/calls.jsonl; do
    [[ -f "$f" ]] || continue
    run_id="$(basename "$(dirname "$f")")"
    dest="${QUAR}/run-${run_id}-${TS}.jsonl"
    mv "$f" "$dest"
    echo "Quarantined run shard → ${dest}"
  done
fi

echo "Legacy Harvey LAB call-store quarantined under ${QUAR}"
echo "Only new runs with CLAWQL_LAB_STACK_VERSION=ts-clawql-data-v2 belong in training buckets."
