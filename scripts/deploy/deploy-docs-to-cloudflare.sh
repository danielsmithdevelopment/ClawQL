#!/usr/bin/env bash
# Deploy website/ (OpenNext + Wrangler) and attach docs.<zone> to Worker clawql-docs.
#
# Uses the same auth env as ClawQL MCP (see src/auth-headers.ts):
#   CLAWQL_CLOUDFLARE_API_TOKEN  or  CLOUDFLARE_API_TOKEN
#
# Equivalent ClawQL execute operations (after MCP has the token set):
#   - zones-get  (args: name=<apex domain>)
#   - workers.domains.update  (PUT body: hostname, service, zone_id, zone_name, environment)
#
# Prerequisite: API token with Workers Scripts write + Workers Routes + Account read
#   + Zone read for the domain zone (see Cloudflare token templates).
#
# Cursor MCP: add to your ClawQL server env so search/execute work:
#   "CLAWQL_CLOUDFLARE_API_TOKEN": "<token>"
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB="$ROOT/website"
TOKEN="${CLAWQL_CLOUDFLARE_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
APEX="${CLAWQL_DOCS_APEX_DOMAIN:-clawql.com}"
HOSTNAME="${CLAWQL_DOCS_HOSTNAME:-docs.${APEX}}"
WORKER_NAME="${CLAWQL_WORKER_NAME:-clawql-docs}"
API="https://api.cloudflare.com/client/v4"

if [[ -z "${TOKEN// }" ]]; then
  echo "ERROR: Set CLAWQL_CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_TOKEN (same as ClawQL)."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required."
  exit 1
fi

cf() {
  curl -sS -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" "$@"
}

echo "==> Resolving account id"
ACCOUNTS_JSON="$(cf "${API}/accounts?per_page=50")"
if [[ "$(echo "$ACCOUNTS_JSON" | jq -r '.success')" != "true" ]]; then
  echo "$ACCOUNTS_JSON" | jq .
  exit 1
fi
ACCOUNT_ID="${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-$(echo "$ACCOUNTS_JSON" | jq -r '.result[0].id // empty')}"
if [[ -z "$ACCOUNT_ID" || "$ACCOUNT_ID" == "null" ]]; then
  echo "ERROR: No account id. Set CLAWQL_CLOUDFLARE_ACCOUNT_ID or fix token Account permissions."
  exit 1
fi
echo "    account_id=$ACCOUNT_ID"

echo "==> Looking up zone for $APEX"
ZONES_JSON="$(cf "${API}/zones?name=${APEX}")"
if [[ "$(echo "$ZONES_JSON" | jq -r '.success')" != "true" ]]; then
  echo "$ZONES_JSON" | jq .
  exit 1
fi
ZONE_ID="$(echo "$ZONES_JSON" | jq -r '.result[0].id // empty')"
if [[ -z "$ZONE_ID" || "$ZONE_ID" == "null" ]]; then
  echo "ERROR: Zone not found for name=$APEX. Is DNS on this Cloudflare account?"
  exit 1
fi
echo "    zone_id=$ZONE_ID"

echo "==> Building and deploying Worker ($WORKER_NAME) from website/"
export CLOUDFLARE_API_TOKEN="$TOKEN"
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://${HOSTNAME}}"
(
  cd "$WEB"
  npm run deploy
)

echo "==> Attaching custom domain $HOSTNAME -> $WORKER_NAME"
BODY="$(jq -n \
  --arg h "$HOSTNAME" \
  --arg s "$WORKER_NAME" \
  --arg zid "$ZONE_ID" \
  --arg zn "$APEX" \
  '{hostname: $h, service: $s, environment: "production", zone_id: $zid, zone_name: $zn}')"
ATTACH="$(curl -sS -X PUT "${API}/accounts/${ACCOUNT_ID}/workers/domains" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY")"
if [[ "$(echo "$ATTACH" | jq -r '.success')" != "true" ]]; then
  echo "$ATTACH" | jq .
  exit 1
fi
echo "$ATTACH" | jq '.result'

echo ""
echo "Done. Site: https://${HOSTNAME}"
echo "If the hostname already existed, Cloudflare may have updated the binding in place."
