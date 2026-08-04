#!/usr/bin/env bash
# Upload publish-ready OpenBench dataset pack to R2 (corpus of record).
#
# Prefer the TypeScript package (Cloudflare API token auto-ensure + REST put,
# same secrets as `clawql sync ensure`). Falls back to aws CLI + S3 keys only.
#
# Fail-loud by default when CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES is unset or 1.

set -euo pipefail

ARTIFACT_DIR=""
RUN_ID="${GITHUB_RUN_ID:-}"
TASK=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact-dir) ARTIFACT_DIR="$2"; shift 2 ;;
    --run-id) RUN_ID="$2"; shift 2 ;;
    --task) TASK="$2"; shift 2 ;;
    --sha) shift 2 ;; # accepted for back-compat; unused
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$ARTIFACT_DIR" || -z "$RUN_ID" || -z "$TASK" ]]; then
  echo "Usage: $0 --artifact-dir DIR --run-id ID --task NAME" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="${ROOT}/packages/openbench-dataset/dist/cli.js"
if [[ -f "$CLI" ]]; then
  EXTRA=()
  if [[ "${CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES:-1}" == "0" || "${CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES:-1}" == "false" ]]; then
    EXTRA+=(--allow-missing-r2)
  fi
  exec node "$CLI" sync \
    --artifact-dir "$ARTIFACT_DIR" \
    --run-id "$RUN_ID" \
    --task "$TASK" \
    "${EXTRA[@]}"
fi

# Legacy aws CLI fallback (S3 keys required).
REQUIRE="${CLAWQL_OPENBENCH_REQUIRE_DURABLE_TRACES:-1}"
BUCKET="${CLAWQL_R2_TRACES_BUCKET:-${CLAWQL_OPENBENCH_R2_BUCKET:-clawql-openbench-traces}}"
ACCOUNT="${CLAWQL_R2_ACCOUNT_ID:-${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}}"
ACCESS_KEY="${CLAWQL_SYNC_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}}"
SECRET_KEY="${CLAWQL_SYNC_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}}"
CF_TOKEN="${CLAWQL_CLOUDFLARE_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

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
[[ -z "$ACCOUNT" ]] && missing+=("CLOUDFLARE_ACCOUNT_ID|CLAWQL_R2_ACCOUNT_ID")
if [[ -z "$ACCESS_KEY" || -z "$SECRET_KEY" ]]; then
  if [[ -z "$CF_TOKEN" ]]; then
    missing+=("CLOUDFLARE_API_TOKEN|CLAWQL_CLOUDFLARE_API_TOKEN (or CLAWQL_SYNC_* S3 keys)")
  else
    fail_or_warn "Build packages/openbench-dataset first (npm run build -w openbench-dataset) to sync with CLOUDFLARE_API_TOKEN alone."
  fi
fi
if ((${#missing[@]} > 0)); then
  fail_or_warn "Durable R2 sink required but missing: ${missing[*]}."
fi

DATASET="${ARTIFACT_DIR}/dataset"
MANIFEST="${DATASET}/MANIFEST.json"
[[ -f "$MANIFEST" ]] || fail_or_warn "Missing ${MANIFEST}"
[[ -d "${DATASET}/traces" ]] || fail_or_warn "No traces under ${DATASET}/traces"

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
