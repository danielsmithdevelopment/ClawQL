#!/usr/bin/env bash
# Deploy apps/docs-astro (static Astro) as Worker Assets `clawql-docs-astro`
# and attach docs.<zone> custom domain + route.
#
# Production cutover (ADR 0018): replaces the OpenNext Worker `clawql-docs`.
# Preview: optional Pages project `clawql-docs-astro` (*.pages.dev) — does not
# require Zone DNS Edit. Custom hostname uses Workers domains/routes instead.
#
# Auth (same as ClawQL MCP / prior docs deploy):
#   CLAWQL_CLOUDFLARE_API_TOKEN  or  CLOUDFLARE_API_TOKEN
#   CLOUDFLARE_ACCOUNT_ID (optional if wrangler.jsonc has account_id)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB="$ROOT/apps/docs-astro"
TOKEN="${CLAWQL_CLOUDFLARE_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
APEX="${CLAWQL_DOCS_APEX_DOMAIN:-clawql.com}"
HOSTNAME="${CLAWQL_DOCS_HOSTNAME:-docs.${APEX}}"
WORKER_NAME="${CLAWQL_DOCS_WORKER_NAME:-clawql-docs-astro}"
PAGES_PROJECT="${CLAWQL_DOCS_PAGES_PROJECT:-clawql-docs-astro}"
DEPLOY_PAGES_PREVIEW="${CLAWQL_DOCS_DEPLOY_PAGES_PREVIEW:-1}"
API="https://api.cloudflare.com/client/v4"
WRANGLER="${WRANGLER_CMD:-npx --yes wrangler@4}"

if [[ -z "${TOKEN// }" ]]; then
  echo "ERROR: Set CLAWQL_CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_TOKEN."
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
ACCOUNT_ID="${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-$(echo "$ACCOUNTS_JSON" | jq -r '.result[0].id // empty')}}"
if [[ -z "$ACCOUNT_ID" || "$ACCOUNT_ID" == "null" ]]; then
  echo "ERROR: No account id. Set CLOUDFLARE_ACCOUNT_ID or fix token Account permissions."
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
  echo "ERROR: Zone not found for name=$APEX."
  exit 1
fi
echo "    zone_id=$ZONE_ID"

echo "==> Building Astro static site ($WEB)"
export CLOUDFLARE_API_TOKEN="$TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
export PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://${HOSTNAME}}"
(
  cd "$WEB"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  npm run build
)

echo "==> Deploying Worker Assets ($WORKER_NAME)"
(
  cd "$WEB"
  $WRANGLER deploy
)

if [[ "$DEPLOY_PAGES_PREVIEW" == "1" ]]; then
  echo "==> Optional Pages preview deploy ($PAGES_PROJECT)"
  CLAWQL_LANDING_PAGES_PROJECT="$PAGES_PROJECT" \
    bash "$ROOT/scripts/deploy/ensure-cloudflare-pages-project.sh" || true
  (
    cd "$WEB"
    $WRANGLER pages deploy dist --project-name="$PAGES_PROJECT" --branch=main --commit-dirty=true || true
  )
fi

echo "==> Attaching custom domain $HOSTNAME -> $WORKER_NAME"
# Drop prior binding if it points at a different service (e.g. legacy clawql-docs).
EXISTING_ID="$(cf "${API}/accounts/${ACCOUNT_ID}/workers/domains?per_page=100" \
  | jq -r --arg h "$HOSTNAME" '.result[]? | select(.hostname==$h) | .id // empty')"
EXISTING_SVC="$(cf "${API}/accounts/${ACCOUNT_ID}/workers/domains?per_page=100" \
  | jq -r --arg h "$HOSTNAME" '.result[]? | select(.hostname==$h) | .service // empty')"
if [[ -n "$EXISTING_ID" && "$EXISTING_SVC" != "$WORKER_NAME" ]]; then
  echo "    removing prior custom domain binding ($EXISTING_SVC)"
  cf -X DELETE "${API}/accounts/${ACCOUNT_ID}/workers/domains/${EXISTING_ID}" >/dev/null || true
fi
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

echo "==> Ensuring Worker route ${HOSTNAME}/* -> $WORKER_NAME"
ROUTE_ID="$(cf "${API}/zones/${ZONE_ID}/workers/routes" \
  | jq -r --arg p "${HOSTNAME}/*" '.result[]? | select(.pattern==$p) | .id // empty')"
if [[ -n "$ROUTE_ID" ]]; then
  cf -X DELETE "${API}/zones/${ZONE_ID}/workers/routes/${ROUTE_ID}" >/dev/null || true
fi
ROUTE_BODY="$(jq -n --arg p "${HOSTNAME}/*" --arg s "$WORKER_NAME" \
  '{pattern: $p, script: $s}')"
ROUTE="$(curl -sS -X POST "${API}/zones/${ZONE_ID}/workers/routes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$ROUTE_BODY")"
if [[ "$(echo "$ROUTE" | jq -r '.success')" != "true" ]]; then
  echo "$ROUTE" | jq .
  exit 1
fi
echo "$ROUTE" | jq '.result'

echo ""
echo "Done. Site: https://${HOSTNAME}"
echo "Worker: ${WORKER_NAME} (Astro static assets — no OpenNext / RSC flight surface)"
if [[ "$DEPLOY_PAGES_PREVIEW" == "1" ]]; then
  echo "Pages preview: https://${PAGES_PROJECT}.pages.dev"
fi
