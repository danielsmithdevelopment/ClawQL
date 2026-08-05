#!/usr/bin/env bash
# Ensure Pulumi R2 state bucket exists and export AWS_* + PULUMI_BACKEND_URL for pulumi login.
#
# Uses CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (same secrets as docs/landing deploy).
#
# R2 S3 credentials for `pulumi login` (S3-compatible API), in order:
#   1) CLAWQL_R2_ACCESS_KEY_ID + CLAWQL_R2_SECRET_ACCESS_KEY
#      (or CLAWQL_SYNC_ACCESS_KEY_ID / CLAWQL_SYNC_SECRET_ACCESS_KEY)
#   2) Derive from Cloudflare API token per
#      https://developers.cloudflare.com/r2/api/tokens/
#        Access Key ID = token id
#        Secret Access Key = SHA-256 hex of the token value
#      Token id sources:
#        a) CLOUDFLARE_API_TOKEN_ID secret (required for account-scoped Workers tokens)
#        b) GET /user/tokens/verify (works for user-scoped tokens only)
#
# Account-scoped "Edit Cloudflare Workers" tokens often 401 on /user/tokens/verify —
# that is expected. Add CLOUDFLARE_API_TOKEN_ID (Dashboard → API Tokens → token id)
# or create R2 S3 keys under R2 → Manage API Tokens.
#
# Usage (CI):
#   source scripts/pulumi/ensure-r2-state-backend.sh
#   # then: pulumi login "$PULUMI_BACKEND_URL"
#
set -euo pipefail

STATE_BUCKET="${PULUMI_STATE_BUCKET:-clawql-pulumi-state}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-${CLAWQL_R2_ACCOUNT_ID:-}}}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CLAWQL_CLOUDFLARE_API_TOKEN:-}}"

if [[ -z "${ACCOUNT_ID}" ]]; then
  echo "::error::CLOUDFLARE_ACCOUNT_ID (or CLAWQL_R2_ACCOUNT_ID) is required" >&2
  exit 1
fi
if [[ -z "${API_TOKEN}" ]]; then
  echo "::error::CLOUDFLARE_API_TOKEN is required" >&2
  exit 1
fi

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "${data}" ]]; then
    curl -fsS -X "${method}" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${data}"
  else
    curl -fsS -X "${method}" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

# Like cf_api but do not fail the script on HTTP errors (caller inspects status/body).
cf_api_soft() {
  local method="$1"
  local path="$2"
  local out_file="$3"
  local http_code
  http_code="$(
    curl -sS -o "${out_file}" -w "%{http_code}" -X "${method}" \
      "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" || true
  )"
  echo "${http_code}"
}

echo "::group::Ensure R2 state bucket ${STATE_BUCKET}"
# List / create via Cloudflare R2 REST (Workers R2 Storage Write)
list_json="$(cf_api GET "/accounts/${ACCOUNT_ID}/r2/buckets" || echo '{}')"
if echo "${list_json}" | jq -e --arg n "${STATE_BUCKET}" '
  (.result.buckets // .result // [])
  | if type=="array" then . else [] end
  | map(.name) | index($n)
' >/dev/null 2>&1; then
  echo "Bucket ${STATE_BUCKET} already exists"
else
  echo "Creating bucket ${STATE_BUCKET}..."
  create_body="$(jq -nc --arg name "${STATE_BUCKET}" '{name:$name, locationHint:"enam"}')"
  if ! cf_api POST "/accounts/${ACCOUNT_ID}/r2/buckets" "${create_body}" >/tmp/clawql-r2-create.json 2>/tmp/clawql-r2-create.err; then
    # Retry without locationHint (older API) or already-exists
    if grep -qi 'already exists\|10004\|409' /tmp/clawql-r2-create.err /tmp/clawql-r2-create.json 2>/dev/null; then
      echo "Bucket ${STATE_BUCKET} already exists (create race)"
    else
      create_body="$(jq -nc --arg name "${STATE_BUCKET}" '{name:$name}')"
      cf_api POST "/accounts/${ACCOUNT_ID}/r2/buckets" "${create_body}" >/tmp/clawql-r2-create.json
      echo "Created ${STATE_BUCKET}"
    fi
  else
    echo "Created ${STATE_BUCKET}"
  fi
fi
echo "::endgroup::"

echo "::group::Resolve R2 S3 credentials for Pulumi backend"
TOKEN_ID=""
if [[ -n "${CLAWQL_R2_ACCESS_KEY_ID:-${CLAWQL_SYNC_ACCESS_KEY_ID:-}}" && -n "${CLAWQL_R2_SECRET_ACCESS_KEY:-${CLAWQL_SYNC_SECRET_ACCESS_KEY:-}}" ]]; then
  export AWS_ACCESS_KEY_ID="${CLAWQL_R2_ACCESS_KEY_ID:-${CLAWQL_SYNC_ACCESS_KEY_ID}}"
  export AWS_SECRET_ACCESS_KEY="${CLAWQL_R2_SECRET_ACCESS_KEY:-${CLAWQL_SYNC_SECRET_ACCESS_KEY}}"
  echo "Using explicit R2/S3 access keys from environment"
else
  # Prefer explicit token id (account-scoped Workers tokens cannot call /user/tokens/verify)
  if [[ -n "${CLOUDFLARE_API_TOKEN_ID:-}" ]]; then
    TOKEN_ID="${CLOUDFLARE_API_TOKEN_ID}"
    echo "Using CLOUDFLARE_API_TOKEN_ID for R2 Access Key ID"
  else
    verify_code=""
    verify_code="$(cf_api_soft GET "/user/tokens/verify" /tmp/clawql-token-verify.json)"
    if [[ "${verify_code}" == "200" ]]; then
      TOKEN_ID="$(jq -r '.result.id // empty' /tmp/clawql-token-verify.json)"
      echo "Resolved token id via /user/tokens/verify"
    else
      echo "::warning::/user/tokens/verify returned HTTP ${verify_code} (common for account-scoped API tokens)."
      jq . /tmp/clawql-token-verify.json 2>/dev/null || cat /tmp/clawql-token-verify.json || true
    fi
  fi

  if [[ -z "${TOKEN_ID}" || "${TOKEN_ID}" == "null" ]]; then
    cat >&2 <<'EOF'
::error::Cannot derive R2 S3 credentials for Pulumi state backend.

Your CLOUDFLARE_API_TOKEN can manage R2 via the Cloudflare REST API (bucket create
succeeded) but cannot be mapped to S3 Access Keys without the token id.

Pick one fix (then re-run the workflow):

  A) Add repo secret CLOUDFLARE_API_TOKEN_ID
     Dashboard → My Profile → API Tokens → open the token → copy Token ID
     (Access Key ID = token id; Secret = SHA-256 of the token value — we compute that)

  B) Add dedicated R2 S3 keys (recommended for CI)
     R2 → Overview → API Tokens → Create API token (Object Read & Write on clawql-pulumi-state)
     Secrets: CLAWQL_R2_ACCESS_KEY_ID + CLAWQL_R2_SECRET_ACCESS_KEY

Docs: https://developers.cloudflare.com/r2/api/tokens/
EOF
    exit 1
  fi

  export AWS_ACCESS_KEY_ID="${TOKEN_ID}"
  derived_secret=""
  derived_secret="$(printf '%s' "${API_TOKEN}" | sha256sum | awk '{print $1}')"
  export AWS_SECRET_ACCESS_KEY="${derived_secret}"
  echo "Derived R2 S3 Secret Access Key = SHA-256(CLOUDFLARE_API_TOKEN)"
fi
export AWS_REGION="${AWS_REGION:-auto}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
# Disable AWS metadata / other credential chains in Actions
export AWS_EC2_METADATA_DISABLED=true
echo "::endgroup::"

ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
export PULUMI_BACKEND_URL="s3://${STATE_BUCKET}?region=auto&endpoint=${ENDPOINT}&awssdk=v2"
echo "PULUMI_BACKEND_URL=${PULUMI_BACKEND_URL}"

# Stable passphrase: prefer dedicated secret; else deterministic from account id (document rotation risk)
if [[ -z "${PULUMI_CONFIG_PASSPHRASE:-}" && -z "${PULUMI_CONFIG_PASSPHRASE_FILE:-}" ]]; then
  derived_pass=""
  derived_pass="$(printf 'clawql-pulumi-v1:%s' "${ACCOUNT_ID}" | sha256sum | awk '{print $1}')"
  export PULUMI_CONFIG_PASSPHRASE="${derived_pass}"
  echo "::warning::PULUMI_CONFIG_PASSPHRASE unset — using account-derived passphrase. Prefer a dedicated repo secret PULUMI_CONFIG_PASSPHRASE for production."
fi

echo "R2 state backend ready (bucket=${STATE_BUCKET})"
