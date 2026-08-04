#!/usr/bin/env bash
# Upload publish-ready OpenBench dataset pack to R2 (corpus of record).
#
# Expected local pack (from build-openbench-dataset.py):
#   $ARTIFACT_DIR/dataset/
#     traces/*.jsonl
#     call-store/calls.jsonl
#     MANIFEST.json
#     schema/openbench-trace.v1.json
#
# Remote layout:
#   s3://$BUCKET/
#     raw/YYYY/MM/DD/run-$RUN_ID/$TASK/          # traces + scrubbed call-store
#     manifests/YYYY/MM/DD/run-$RUN_ID-$TASK.json
#     schema/v1.0.json
#
# Fail-loud by default when CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES is unset or 1.
# Set CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES=0 only for dry-runs without R2.
#
# Bucket secret aliases (first wins):
#   CLAWQL_R2_TRACES_BUCKET | CLAWQL_OPENBENCH_R2_BUCKET | CLAWQL_SYNC_BUCKET

set -euo pipefail

ARTIFACT_DIR=""
RUN_ID="${GITHUB_RUN_ID:-}"
TASK=""
SHA="${GITHUB_SHA:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact-dir) ARTIFACT_DIR="$2"; shift 2 ;;
    --run-id) RUN_ID="$2"; shift 2 ;;
    --task) TASK="$2"; shift 2 ;;
    --sha) SHA="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$ARTIFACT_DIR" || -z "$RUN_ID" || -z "$TASK" ]]; then
  echo "Usage: $0 --artifact-dir DIR --run-id ID --task NAME" >&2
  exit 2
fi

REQUIRE="${CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES:-1}"
BUCKET="${CLAWQL_R2_TRACES_BUCKET:-${CLAWQL_OPENBENCH_R2_BUCKET:-${CLAWQL_SYNC_BUCKET:-}}}"
ACCOUNT="${CLAWQL_R2_ACCOUNT_ID:-${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}}"
ACCESS_KEY="${CLAWQL_SYNC_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}}"
SECRET_KEY="${CLAWQL_SYNC_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}}"

fail_or_warn() {
  local msg="$1"
  if [[ "$REQUIRE" == "0" || "$REQUIRE" == "false" ]]; then
    echo "::warning::${msg}"
    exit 0
  fi
  echo "::error::${msg}"
  exit 1
}

missing=()
[[ -z "$BUCKET" ]] && missing+=("CLAWQL_R2_TRACES_BUCKET|CLAWQL_OPENBENCH_R2_BUCKET|CLAWQL_SYNC_BUCKET")
[[ -z "$ACCOUNT" ]] && missing+=("CLOUDFLARE_ACCOUNT_ID|CLAWQL_R2_ACCOUNT_ID")
[[ -z "$ACCESS_KEY" ]] && missing+=("CLAWQL_SYNC_ACCESS_KEY_ID|R2_ACCESS_KEY_ID")
[[ -z "$SECRET_KEY" ]] && missing+=("CLAWQL_SYNC_SECRET_ACCESS_KEY|R2_SECRET_ACCESS_KEY")

if ((${#missing[@]} > 0)); then
  fail_or_warn "Durable R2 sink required but missing: ${missing[*]}. A live OpenBench run without persisted traces is wasted compute."
fi

DATASET="${ARTIFACT_DIR}/dataset"
MANIFEST="${DATASET}/MANIFEST.json"
if [[ ! -f "$MANIFEST" ]]; then
  fail_or_warn "Missing ${MANIFEST} — run build-openbench-dataset.py before durable sync"
fi
if [[ ! -d "${DATASET}/traces" ]] || [[ -z "$(ls -A "${DATASET}/traces" 2>/dev/null || true)" ]]; then
  fail_or_warn "No validated traces under ${DATASET}/traces"
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Installing AWS CLI v2 (R2 S3-compatible put)…"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install >/dev/null
fi

DAY="$(date -u +%Y/%m/%d)"
ENDPOINT="https://${ACCOUNT}.r2.cloudflarestorage.com"
RAW_DEST="s3://${BUCKET}/raw/${DAY}/run-${RUN_ID}/${TASK}"
MANIFEST_DEST="s3://${BUCKET}/manifests/${DAY}/run-${RUN_ID}-${TASK}.json"
SCHEMA_DEST="s3://${BUCKET}/schema/v1.0.json"

export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"

echo "Uploading raw pack → ${RAW_DEST}/"
aws s3 sync "${DATASET}/traces/" "${RAW_DEST}/" --endpoint-url "$ENDPOINT" --no-progress
if [[ -f "${DATASET}/call-store/calls.jsonl" ]]; then
  aws s3 cp "${DATASET}/call-store/calls.jsonl" "${RAW_DEST}/call-store/calls.jsonl" \
    --endpoint-url "$ENDPOINT" --no-progress
fi
aws s3 cp "$MANIFEST" "$MANIFEST_DEST" --endpoint-url "$ENDPOINT" --no-progress
if [[ -f "${DATASET}/schema/openbench-trace.v1.json" ]]; then
  aws s3 cp "${DATASET}/schema/openbench-trace.v1.json" "$SCHEMA_DEST" \
    --endpoint-url "$ENDPOINT" --no-progress
fi

TRACE_N="$(find "${DATASET}/traces" -type f -name '*.jsonl' | wc -l | tr -d ' ')"
echo "::notice::Durable OpenBench traces → ${RAW_DEST}/ (${TRACE_N} files); manifest → ${MANIFEST_DEST}"
echo "DURABLE_RAW_URI=${RAW_DEST}/"
echo "DURABLE_MANIFEST_URI=${MANIFEST_DEST}"
