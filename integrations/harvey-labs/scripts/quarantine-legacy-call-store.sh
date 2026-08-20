#!/usr/bin/env bash
# Move pre-ts-v2 Harvey LAB call-store shards out of the training path.
#
# Usage:
#   bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh
#   bash integrations/harvey-labs/scripts/quarantine-legacy-call-store.sh /path/to/calls.jsonl
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# Homelab historically used ~/.ClawQL; some scripts defaulted to ~/.clawql.
if [[ -n "${CLAWQL_HOME:-}" ]]; then
  HOME_DIR="${CLAWQL_HOME}"
elif [[ -d "${HOME}/.ClawQL" ]]; then
  HOME_DIR="${HOME}/.ClawQL"
elif [[ -d "${HOME}/.clawql" ]]; then
  HOME_DIR="${HOME}/.clawql"
else
  HOME_DIR="${HOME}/.ClawQL"
fi

STORE="${1:-${CLAWQL_INFERENCE_STORE_PATH:-$HOME_DIR/HarveyLAB/call-store/calls.jsonl}}"
QUAR="${HOME_DIR}/HarveyLAB/call-store/quarantine/python-duckdb-v1"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$QUAR"

quarantined=0
if [[ -f "$STORE" ]]; then
  dest="${QUAR}/calls-${TS}.jsonl"
  mv "$STORE" "$dest"
  echo "Quarantined shared call-store → ${dest}"
  quarantined=1
fi

runs="${HOME_DIR}/HarveyLAB/call-store/runs"
if [[ -d "$runs" ]]; then
  for f in "$runs"/*/calls.jsonl; do
    [[ -f "$f" ]] || continue
    run_id="$(basename "$(dirname "$f")")"
    dest="${QUAR}/run-${run_id}-${TS}.jsonl"
    mv "$f" "$dest"
    echo "Quarantined run shard → ${dest}"
    quarantined=1
  done
fi

# Also sweep the alternate casing home if it exists and differs.
ALT=""
if [[ "${HOME_DIR}" == "${HOME}/.ClawQL" && -d "${HOME}/.clawql/HarveyLAB/call-store" ]]; then
  ALT="${HOME}/.clawql"
elif [[ "${HOME_DIR}" == "${HOME}/.clawql" && -d "${HOME}/.ClawQL/HarveyLAB/call-store" ]]; then
  ALT="${HOME}/.ClawQL"
fi
if [[ -n "$ALT" ]]; then
  ALT_QUAR="${ALT}/HarveyLAB/call-store/quarantine/python-duckdb-v1"
  mkdir -p "$ALT_QUAR"
  if [[ -f "${ALT}/HarveyLAB/call-store/calls.jsonl" ]]; then
    mv "${ALT}/HarveyLAB/call-store/calls.jsonl" "${ALT_QUAR}/calls-${TS}.jsonl"
    echo "Quarantined alt-home call-store → ${ALT_QUAR}/calls-${TS}.jsonl"
    quarantined=1
  fi
  if [[ -d "${ALT}/HarveyLAB/call-store/runs" ]]; then
    for f in "${ALT}/HarveyLAB/call-store/runs"/*/calls.jsonl; do
      [[ -f "$f" ]] || continue
      run_id="$(basename "$(dirname "$f")")"
      mv "$f" "${ALT_QUAR}/run-${run_id}-${TS}.jsonl"
      echo "Quarantined alt-home run shard → ${ALT_QUAR}/run-${run_id}-${TS}.jsonl"
      quarantined=1
    done
  fi
fi

if [[ "$quarantined" -eq 0 ]]; then
  echo "No call-store JSONL found under ${HOME_DIR}/HarveyLAB/call-store (nothing to move)."
fi
echo "Legacy Harvey LAB call-store quarantined under ${QUAR}"
echo "Only new runs with CLAWQL_LAB_STACK_VERSION=ts-clawql-data-v2 belong in training buckets."
