#!/usr/bin/env bash
# Create DNS for AI Discovery (DNS-AID) records for an apex domain on Cloudflare.
# Idempotent: skips records that already exist with matching content.
#
# Env:
#   CLOUDFLARE_API_TOKEN (required)
#   CLOUDFLARE_ACCOUNT_ID (optional — resolved when unset)
#   CLAWQL_APEX_DOMAIN (default: clawql.com)
#
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
APEX="${CLAWQL_APEX_DOMAIN:-clawql.com}"
API="https://api.cloudflare.com/client/v4"

if [[ -z "${TOKEN// }" ]]; then
  echo "SKIP: CLOUDFLARE_API_TOKEN unset — DNS-AID records not updated."
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq required"
  exit 1
fi

cf() {
  curl -sS -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" "$@"
}

echo "==> Looking up zone for ${APEX}"
ZONES_JSON="$(cf "${API}/zones?name=${APEX}")"
ZONE_ID="$(echo "$ZONES_JSON" | jq -r '.result[0].id // empty')"
if [[ -z "$ZONE_ID" || "$ZONE_ID" == "null" ]]; then
  echo "SKIP: Zone not found for ${APEX}"
  exit 0
fi
echo "    zone_id=${ZONE_ID}"

upsert_txt() {
  local name="$1"
  local content="$2"
  local existing
  existing="$(cf "${API}/zones/${ZONE_ID}/dns_records?type=TXT&name=${name}")"
  local id
  id="$(echo "$existing" | jq -r --arg c "$content" '.result[] | select(.content == $c) | .id' | head -1)"
  if [[ -n "$id" && "$id" != "null" ]]; then
    echo "    TXT ${name} already present"
    return 0
  fi
  local body
  body="$(jq -n --arg name "$name" --arg content "$content" '{type:"TXT",name:$name,content:$content,ttl:3600}')"
  local resp
  resp="$(cf -X POST "${API}/zones/${ZONE_ID}/dns_records" -d "$body")"
  if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
    echo "$resp" | jq .
    return 1
  fi
  echo "    Created TXT ${name}"
}

upsert_https() {
  local name="$1"
  local target="$2"
  local existing
  existing="$(cf "${API}/zones/${ZONE_ID}/dns_records?type=HTTPS&name=${name}")"
  local id
  id="$(echo "$existing" | jq -r --arg t "$target" '.result[] | select(.data.target == $t) | .id' | head -1)"
  if [[ -n "$id" && "$id" != "null" ]]; then
    echo "    HTTPS ${name} already present"
    return 0
  fi
  local body
  body="$(jq -n --arg name "$name" --arg target "$target" '{type:"HTTPS",name:$name,ttl:3600,data:{priority:1,target:$target,alpn:"h3,h2",port:443}}')"
  local resp
  resp="$(cf -X POST "${API}/zones/${ZONE_ID}/dns_records" -d "$body")"
  if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
    echo "$resp" | jq .
    return 1
  fi
  echo "    Created HTTPS ${name} -> ${target}"
}

echo "==> DNS-AID index TXT"
upsert_txt "_index._agents.${APEX}" "v=aid1; mcp=/.well-known/mcp/server-card.json; a2a=/.well-known/agent-card.json; api=/.well-known/api-catalog"

echo "==> DNS-AID HTTPS service records"
upsert_https "_mcp._agents.${APEX}" "${APEX}"
upsert_https "_a2a._agents.${APEX}" "${APEX}"
upsert_https "_index._agents.${APEX}" "${APEX}"

echo "Done. DNS-AID records ensured for ${APEX}"
