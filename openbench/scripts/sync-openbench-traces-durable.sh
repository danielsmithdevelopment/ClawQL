#!/usr/bin/env bash
# Sync an OpenBench artifact pack to durable object storage (R2 via S3 API).
#
# GitHub Actions artifacts expire (~90d). This is the corpus-of-record sink so
# fine-tune traces accumulate indefinitely until you delete them.
#
# Layout (immutable per run/task):
#   s3://$BUCKET/$PREFIX/<run_id>/<task>/
#     calls.jsonl
#     trace-session-labels.json
#     results.json          (if present)
#     summary.md           (if present)
#     MANIFEST.json
#
# Auth (first match wins for keys):
#   CLAWQL_SYNC_ACCESS_KEY_ID / CLAWQL_SYNC_SECRET_ACCESS_KEY
#   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#
# Required:
#   CLAWQL_OPENBENCH_R2_BUCKET (or CLAWQL_SYNC_BUCKET)
#   CLOUDFLARE_ACCOUNT_ID (or CLAWQL_R2_ACCOUNT_ID / CLAWQL_CLOUDFLARE_ACCOUNT_ID)
#
# Optional:
#   CLAWQL_OPENBENCH_R2_PREFIX   default: openbench-traces
#   CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES=1  → exit 1 if creds/bucket missing
#
# Usage:
#   openbench/scripts/sync-openbench-traces-durable.sh \
#     --artifact-dir artifacts/openbench-ab/search-first-discovery \
#     --run-id 123 --task search-first-discovery

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
    -h|--help)
      sed -n '2,35p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$ARTIFACT_DIR" || -z "$RUN_ID" || -z "$TASK" ]]; then
  echo "Usage: $0 --artifact-dir DIR --run-id ID --task NAME" >&2
  exit 2
fi

REQUIRE="${CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES:-0}"
BUCKET="${CLAWQL_OPENBENCH_R2_BUCKET:-${CLAWQL_SYNC_BUCKET:-}}"
ACCOUNT="${CLAWQL_R2_ACCOUNT_ID:-${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}}"
PREFIX="${CLAWQL_OPENBENCH_R2_PREFIX:-openbench-traces}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"

ACCESS_KEY="${CLAWQL_SYNC_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}}"
SECRET_KEY="${CLAWQL_SYNC_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}}"

missing=()
[[ -z "$BUCKET" ]] && missing+=("CLAWQL_OPENBENCH_R2_BUCKET|CLAWQL_SYNC_BUCKET")
[[ -z "$ACCOUNT" ]] && missing+=("CLOUDFLARE_ACCOUNT_ID|CLAWQL_R2_ACCOUNT_ID")
[[ -z "$ACCESS_KEY" ]] && missing+=("CLAWQL_SYNC_ACCESS_KEY_ID|R2_ACCESS_KEY_ID")
[[ -z "$SECRET_KEY" ]] && missing+=("CLAWQL_SYNC_SECRET_ACCESS_KEY|R2_SECRET_ACCESS_KEY")

if ((${#missing[@]} > 0)); then
  msg="Durable trace sink not configured (missing: ${missing[*]}). Actions artifacts alone expire in ~90 days."
  if [[ "$REQUIRE" == "1" || "$REQUIRE" == "true" ]]; then
    echo "::error::${msg}"
    exit 1
  fi
  echo "::warning::${msg}"
  exit 0
fi

CALLS="${ARTIFACT_DIR}/call-store/calls.jsonl"
if [[ ! -f "$CALLS" ]]; then
  echo "::warning::No call-store JSONL at ${CALLS} — nothing durable to upload"
  exit 0
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Installing AWS CLI v2 (R2 S3-compatible put)…"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install >/dev/null
fi

ENDPOINT="https://${ACCOUNT}.r2.cloudflarestorage.com"
DEST="s3://${BUCKET}/${PREFIX}/${RUN_ID}/${TASK}"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "${STAGING}/pack"
cp "$CALLS" "${STAGING}/pack/calls.jsonl"
[[ -f "${ARTIFACT_DIR}/trace-session-labels.json" ]] && cp "${ARTIFACT_DIR}/trace-session-labels.json" "${STAGING}/pack/"
[[ -f "${ARTIFACT_DIR}/results.json" ]] && cp "${ARTIFACT_DIR}/results.json" "${STAGING}/pack/"
[[ -f "${ARTIFACT_DIR}/summary.md" ]] && cp "${ARTIFACT_DIR}/summary.md" "${STAGING}/pack/"

RECORD_COUNT="$(wc -l < "${STAGING}/pack/calls.jsonl" | tr -d ' ')"
BYTES="$(wc -c < "${STAGING}/pack/calls.jsonl" | tr -d ' ')"
cat > "${STAGING}/pack/MANIFEST.json" <<EOF
{
  "schema": "clawql.openbench.durable-trace-pack.v1",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "github_run_id": "${RUN_ID}",
  "github_sha": "${SHA}",
  "task": "${TASK}",
  "bucket": "${BUCKET}",
  "prefix": "${PREFIX}/${RUN_ID}/${TASK}",
  "calls_jsonl_records": ${RECORD_COUNT},
  "calls_jsonl_bytes": ${BYTES},
  "note": "Corpus of record for fine-tune. GitHub Actions artifacts are a 90d cache only."
}
EOF

export AWS_ACCESS_KEY_ID="$ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$SECRET_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# R2 ignores region but aws cli wants one.

echo "Uploading durable pack → ${DEST}/ (${RECORD_COUNT} records, ${BYTES} bytes)"
aws s3 sync "${STAGING}/pack/" "${DEST}/" \
  --endpoint-url "$ENDPOINT" \
  --no-progress

echo "::notice::Durable traces → ${DEST}/ (${RECORD_COUNT} records)"
echo "DURABLE_TRACE_URI=${DEST}/"
