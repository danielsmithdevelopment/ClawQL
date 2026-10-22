#!/usr/bin/env bash
# Attach clawql.com (and www) to Cloudflare Pages project so functions/
# (Link headers, Accept: text/markdown, /mcp discovery MCP) serve on the apex.
#
# Orange-cloud in front of GitHub Pages alone does NOT run Pages Functions.
# Custom domain on the Pages project is required for AgentReady edge checks.
#
# Env:
#   CLOUDFLARE_API_TOKEN (required)
#   CLOUDFLARE_ACCOUNT_ID (required)
#   CLAWQL_APEX_DOMAIN (default: clawql.com)
#   CLAWQL_LANDING_PAGES_PROJECT (default: clawql-website)
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
APEX="${CLAWQL_APEX_DOMAIN:-clawql.com}"
PROJECT="${CLAWQL_LANDING_PAGES_PROJECT:-clawql-website}"
API="https://api.cloudflare.com/client/v4"

if [[ -z "${TOKEN// }" || -z "${ACCOUNT_ID// }" ]]; then
  echo "SKIP: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID unset — Pages domain not attached."
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq required"
  exit 1
fi

cf() {
  curl -sS -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" "$@"
}

echo "==> Ensure Cloudflare Pages custom domains for ${PROJECT}"
for host in "${APEX}" "www.${APEX}"; do
  existing="$(cf "${API}/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains")"
  if echo "$existing" | jq -e --arg h "$host" '.result[]? | select(.name == $h)' >/dev/null 2>&1; then
    echo "    domain already attached: ${host}"
    continue
  fi
  body="$(jq -n --arg name "$host" '{name: $name}')"
  resp="$(cf -X POST "${API}/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains" -d "$body")"
  if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
    echo "$resp" | jq .
    echo "    WARN: failed to attach ${host} (token may lack Pages Write, or DNS conflict)."
    continue
  fi
  echo "    Attached ${host} → ${PROJECT}"
done

echo "==> Prefer Pages origin over bare GitHub Pages A records when both exist"
ZONES_JSON="$(cf "${API}/zones?name=${APEX}")"
ZONE_ID="$(echo "$ZONES_JSON" | jq -r '.result[0].id // empty')"
if [[ -z "$ZONE_ID" || "$ZONE_ID" == "null" ]]; then
  echo "    SKIP: zone not found for ${APEX}"
  exit 0
fi

PAGES_TARGET="${PROJECT}.pages.dev"
# If apex still has unproxied/proxied GH Pages A records and no CNAME to Pages, add CNAME.
RECORDS="$(cf "${API}/zones/${ZONE_ID}/dns_records?name=${APEX}&per_page=100")"
HAS_PAGES_CNAME="$(echo "$RECORDS" | jq -r --arg t "$PAGES_TARGET" '
  [.result[]? | select(.type=="CNAME" and (.content==$t or .content==($t+".")))] | length
')"
if [[ "$HAS_PAGES_CNAME" == "0" ]]; then
  # Delete GH Pages A/AAAA that block CNAME at apex (CF CNAME flattening replaces them).
  echo "$RECORDS" | jq -c '.result[]? | select(.type=="A" or .type=="AAAA")' | while IFS= read -r row; do
    content="$(echo "$row" | jq -r '.content')"
    rid="$(echo "$row" | jq -r '.id')"
    if [[ "$content" == 185.199.* ]] || [[ "$content" == 2606:50c0:* ]]; then
      echo "    Removing GitHub Pages ${content} record ${rid} so Pages CNAME can own apex"
      cf -X DELETE "${API}/zones/${ZONE_ID}/dns_records/${rid}" >/dev/null || true
    fi
  done
  body="$(jq -n --arg name "$APEX" --arg content "$PAGES_TARGET" \
    '{type:"CNAME",name:$name,content:$content,ttl:1,proxied:true}')"
  resp="$(cf -X POST "${API}/zones/${ZONE_ID}/dns_records" -d "$body")"
  if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
    echo "$resp" | jq .
    echo "    WARN: could not create CNAME ${APEX} → ${PAGES_TARGET}"
  else
    echo "    Created proxied CNAME ${APEX} → ${PAGES_TARGET}"
  fi
else
  echo "    Pages CNAME already present for ${APEX}"
fi

echo "Done. Apex should resolve through Cloudflare Pages (${PROJECT}) so functions/ apply."
