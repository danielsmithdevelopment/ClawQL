#!/usr/bin/env bash
# Download the latest successful Fast Decision frontier adjudication artifact.
# Does not invent labels — fails closed when no successful live run exists.
#
# Usage:
#   bash scripts/fetch-frontier-adjudication-artifact.sh [outdir]
#   SUITE=v0.4-routing-fresh bash scripts/fetch-frontier-adjudication-artifact.sh [outdir]
#   RESCORE=1 SUITE=v0.4-routing-fresh bash scripts/fetch-frontier-adjudication-artifact.sh [outdir]
#     → also runs held-out validation with --labels-in + live GLiNER when
#       CLAWQL_FAST_DECISION_GLINER_URL is set.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/artifacts/held-out-frontier-from-gha}"
SUITE="${SUITE:-}"
mkdir -p "$OUT"

WF="fast-decision-frontier-adjudication.yml"
# Optional: RUN_ID=<id> skips lookup. When SUITE is set, walk recent successful
# runs until the suite-named artifact is present (avoids grabbing a prior suite).
RUN_ID="${RUN_ID:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

download_suite_artifact() {
  local run_id="$1"
  local name="held-out-frontier-adjudication-${SUITE}"
  rm -rf "${TMP:?}"/*
  if gh run download "$run_id" -n "$name" -D "$TMP" 2>/dev/null; then
    echo "$name"
    return 0
  fi
  return 1
}

if [[ -n "${RUN_ID}" ]]; then
  echo "Using RUN_ID=${RUN_ID}${SUITE:+ (suite=$SUITE)} …"
elif [[ -n "${SUITE}" ]]; then
  echo "Looking up successful run of $WF with artifact held-out-frontier-adjudication-${SUITE} …"
  mapfile -t CANDIDATES < <(
    gh run list --workflow="$WF" --status=success --limit 50 \
      --json databaseId,conclusion \
      --jq '[.[] | select(.conclusion=="success")] | .[].databaseId'
  )
  DOWNLOADED=""
  for cand in "${CANDIDATES[@]}"; do
    if DOWNLOADED="$(download_suite_artifact "$cand")"; then
      RUN_ID="$cand"
      echo "Downloaded artifact: $DOWNLOADED from run $RUN_ID"
      break
    fi
  done
  if [[ -z "${RUN_ID}" || -z "${DOWNLOADED:-}" ]]; then
    echo "No successful frontier adjudication run with suite=${SUITE} artifact found." >&2
    exit 2
  fi
else
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
fi

# Download into a fresh temp dir then promote — gh run download refuses to
# overwrite existing files in OUT (re-fetch / audit re-runs would false-fail).
if [[ -z "${DOWNLOADED:-}" ]]; then
  echo "Downloading artifacts from run $RUN_ID → $OUT"
  ARTIFACT_NAMES=()
  if [[ -n "${SUITE}" ]]; then
    ARTIFACT_NAMES+=("held-out-frontier-adjudication-${SUITE}")
  fi
  # Legacy name (pre-suite matrix) + v0.1 default.
  ARTIFACT_NAMES+=("held-out-frontier-adjudication" "held-out-frontier-adjudication-v0.1")

  DOWNLOADED=""
  for name in "${ARTIFACT_NAMES[@]}"; do
    rm -rf "${TMP:?}"/*
    if gh run download "$RUN_ID" -n "$name" -D "$TMP" 2>/dev/null; then
      DOWNLOADED="$name"
      echo "Downloaded artifact: $name"
      break
    fi
  done
  if [[ -z "${DOWNLOADED}" ]]; then
    echo "No held-out-frontier-adjudication* artifact on run $RUN_ID (likely credential-gate skip-notice only)." >&2
    exit 3
  fi
else
  echo "Using downloaded suite artifact under $OUT"
fi

# Promote known artifact files; preserve unrelated OUT contents (e.g. local rescores).
for f in held-out-frontier-labels.json held-out-frontier-summary.json gliner2-healthz.json \
  held-out-frontier-labels-v0.1.json held-out-frontier-summary-v0.1.json \
  held-out-frontier-labels-v0.2-harvey.json held-out-frontier-summary-v0.2-harvey.json \
  held-out-frontier-labels-v0.3-routing-fresh.json held-out-frontier-summary-v0.3-routing-fresh.json \
  held-out-frontier-labels-v0.4-routing-fresh.json held-out-frontier-summary-v0.4-routing-fresh.json \
  held-out-frontier-labels-v0.5-routing-fresh.json held-out-frontier-summary-v0.5-routing-fresh.json; do
  if [[ -f "$TMP/$f" ]]; then
    cp -f "$TMP/$f" "$OUT/$f"
  fi
done
# Prefer suite-suffixed files as the canonical labels/summary when SUITE is set.
if [[ -n "${SUITE}" ]]; then
  if [[ -f "$OUT/held-out-frontier-labels-${SUITE}.json" ]]; then
    cp -f "$OUT/held-out-frontier-labels-${SUITE}.json" "$OUT/held-out-frontier-labels.json"
  fi
  if [[ -f "$OUT/held-out-frontier-summary-${SUITE}.json" ]]; then
    cp -f "$OUT/held-out-frontier-summary-${SUITE}.json" "$OUT/held-out-frontier-summary.json"
  fi
fi
# Copy any other files from the artifact as well
shopt -s nullglob
for f in "$TMP"/*; do
  base="$(basename "$f")"
  case "$base" in
    held-out-frontier-labels.json|held-out-frontier-summary.json|gliner2-healthz.json) ;;
    held-out-frontier-labels-*.json|held-out-frontier-summary-*.json) ;;
    *) cp -f "$f" "$OUT/$base" ;;
  esac
done
shopt -u nullglob

SUMMARY="$OUT/held-out-frontier-summary.json"
LABELS="$OUT/held-out-frontier-labels.json"
if [[ -f "$SUMMARY" ]]; then
  MODE="$(
    node --input-type=module -e \
      "import { readFileSync } from 'node:fs'; const s=JSON.parse(readFileSync(process.argv[1],'utf8')); console.log(s.adjudicationMode||'')" \
      "$SUMMARY"
  )"
  SID="$(
    node --input-type=module -e \
      "import { readFileSync } from 'node:fs'; const s=JSON.parse(readFileSync(process.argv[1],'utf8')); console.log(s.suiteId||'')" \
      "$SUMMARY"
  )"
  echo "adjudicationMode=$MODE suiteId=$SID"
  if [[ "$MODE" != "live" ]]; then
    echo "Downloaded summary is not live adjudication (mode=$MODE) — refusing to treat as frontier corpus." >&2
    exit 4
  fi
  if [[ -n "${SUITE}" ]]; then
    EXPECT=""
    case "${SUITE}" in
      v0.1) EXPECT="fast-decision-held-out-v0.1" ;;
      v0.2-harvey) EXPECT="fast-decision-held-out-v0.2-harvey" ;;
      v0.3-routing-fresh) EXPECT="fast-decision-held-out-v0.3-routing-fresh" ;;
      v0.4-routing-fresh) EXPECT="fast-decision-held-out-v0.4-routing-fresh" ;;
      v0.5-routing-fresh) EXPECT="fast-decision-held-out-v0.5-routing-fresh" ;;
    esac
    if [[ -n "${EXPECT}" && "${SID}" != "${EXPECT}" ]]; then
      echo "Suite mismatch: wanted ${EXPECT}, got suiteId=${SID} (artifact ${DOWNLOADED})." >&2
      exit 7
    fi
  fi
fi

echo "OK: frontier labels under $OUT"
ls -la "$OUT"

if [[ "${RESCORE:-0}" == "1" ]]; then
  if [[ -z "${CLAWQL_FAST_DECISION_GLINER_URL:-}" ]]; then
    echo "RESCORE=1 requires CLAWQL_FAST_DECISION_GLINER_URL for live gliner2 scores." >&2
    exit 5
  fi
  if [[ ! -f "$LABELS" ]]; then
    echo "Missing $LABELS for --labels-in rescore." >&2
    exit 6
  fi
  echo "Rescoring with --labels-in $LABELS${SUITE:+ --suite $SUITE} …"
  RESCORE_ARGS=(--labels-in "$LABELS" --out "$OUT/held-out-rescore-with-live-gliner.json")
  if [[ -n "${SUITE}" ]]; then
    RESCORE_ARGS+=(--suite "${SUITE}")
  fi
  npx tsx "$ROOT/scripts/run-held-out-adjudication.mts" \
    "${RESCORE_ARGS[@]}" \
    | tee "$OUT/held-out-rescore-summary.json"
fi
