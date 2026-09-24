#!/usr/bin/env bash
# Download the latest successful §13.5 Cost Explorer export artifact (fail-closed).
# Does NOT invent $Y — exits non-zero when no live CE CSVs exist.
#
# Usage:
#   bash scripts/fetch-section13-ce-export-artifact.sh [outdir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/artifacts/section13-ce-from-gha}"
mkdir -p "$OUT"

WF="aws-celld-burst-section13-dry-run.yml"
ARTIFACT="section13-ce-export"
echo "Looking up latest successful CE export artifact on $WF …"

# Prefer runs that uploaded the CE artifact (live export job), not dry-run-only.
RUN_ID=""
while IFS= read -r id; do
  [[ -z "$id" ]] && continue
  if gh run view "$id" --json artifacts --jq '.artifacts[]?.name' 2>/dev/null | grep -qx "$ARTIFACT"; then
    RUN_ID="$id"
    break
  fi
done < <(
  gh run list --workflow="$WF" --status=success --limit 30 \
    --json databaseId --jq '.[].databaseId'
)

if [[ -z "${RUN_ID}" ]]; then
  echo "No successful §13.5 CE export artifact found (CLAWQL_CE_* / AWS secrets may be missing, or export has not been dispatched)." >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
echo "Downloading $ARTIFACT from run $RUN_ID → $OUT"
if ! gh run download "$RUN_ID" -n "$ARTIFACT" -D "$TMP"; then
  echo "Artifact $ARTIFACT missing on run $RUN_ID." >&2
  exit 3
fi

for f in ce-arm-a.csv ce-arm-b.csv ce-arm-c.csv ce-export-summary.json; do
  if [[ -f "$TMP/$f" ]]; then
    cp -f "$TMP/$f" "$OUT/$f"
  fi
done
shopt -s nullglob
for f in "$TMP"/*; do
  base="$(basename "$f")"
  case "$base" in
    ce-arm-a.csv|ce-arm-b.csv|ce-arm-c.csv|ce-export-summary.json) ;;
    *) cp -f "$f" "$OUT/$base" ;;
  esac
done
shopt -u nullglob

for arm in a b c; do
  if [[ ! -f "$OUT/ce-arm-${arm}.csv" ]]; then
    echo "Missing ce-arm-${arm}.csv under $OUT — refusing incomplete CE export." >&2
    exit 4
  fi
done

echo "OK: CE arm CSVs under $OUT"
ls -la "$OUT"
