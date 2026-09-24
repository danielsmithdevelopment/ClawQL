#!/usr/bin/env bash
# Download the latest successful Fast Decision frontier adjudication artifact.
# Does not invent labels — fails closed when no successful live run exists.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/artifacts/held-out-frontier-from-gha}"
mkdir -p "$OUT"

WF="fast-decision-frontier-adjudication.yml"
echo "Looking up latest successful run of $WF …"
RUN_ID="$(
  gh run list --workflow="$WF" --status=success --limit 50 \
    --json databaseId,conclusion \
    --jq '[.[] | select(.conclusion=="success")][0].databaseId // empty'
)"
if [[ -z "${RUN_ID}" ]]; then
  echo "No successful frontier adjudication run found (secrets may be missing or schedule has not fired)." >&2
  exit 2
fi

echo "Downloading artifacts from run $RUN_ID → $OUT"
if ! gh run download "$RUN_ID" -n held-out-frontier-adjudication -D "$OUT"; then
  echo "Artifact held-out-frontier-adjudication missing on run $RUN_ID (likely credential-gate skip-notice only)." >&2
  exit 3
fi

SUMMARY="$OUT/held-out-frontier-summary.json"
if [[ -f "$SUMMARY" ]]; then
  MODE="$(
    node --input-type=module -e \
      "import { readFileSync } from 'node:fs'; const s=JSON.parse(readFileSync(process.argv[1],'utf8')); console.log(s.adjudicationMode||'')" \
      "$SUMMARY"
  )"
  echo "adjudicationMode=$MODE"
  if [[ "$MODE" != "live" ]]; then
    echo "Downloaded summary is not live adjudication (mode=$MODE) — refusing to treat as frontier corpus." >&2
    exit 4
  fi
fi

echo "OK: frontier labels under $OUT"
ls -la "$OUT"
