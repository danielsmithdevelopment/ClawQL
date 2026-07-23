#!/usr/bin/env bash
# Ensure clawql.com can pass isitagentready.com checks that require Cloudflare edge:
#   - Orange-cloud apex (so Transform Rules + Markdown for Agents apply)
#   - Markdown for Agents (zone content_converter)
#   - Link response header transform
#   - DNS-AID records (delegates to ensure-dns-aid-records.sh)
#
# Env:
#   CLOUDFLARE_API_TOKEN (required)
#   CLAWQL_APEX_DOMAIN (default: clawql.com)
#   CLAWQL_AGENT_EDGE_PROXY=1 (default) — set apex A/AAAA/CNAME to proxied
#   CLAWQL_AGENT_EDGE_MARKDOWN=1 (default) — enable content_converter
#   CLAWQL_AGENT_EDGE_LINK_HEADER=1 (default) — upsert Link header transform
#
# Idempotent. Safe to re-run from CI after landing deploys.
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
APEX="${CLAWQL_APEX_DOMAIN:-clawql.com}"
API="https://api.cloudflare.com/client/v4"
DOCS="https://docs.clawql.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default proxy=auto: orange-cloud only when apex still points at GitHub Pages IPs.
# Set CLAWQL_AGENT_EDGE_PROXY=0|1 to force.
PROXY="${CLAWQL_AGENT_EDGE_PROXY:-auto}"
MARKDOWN="${CLAWQL_AGENT_EDGE_MARKDOWN:-1}"
LINK_HEADER="${CLAWQL_AGENT_EDGE_LINK_HEADER:-1}"

if [[ -z "${TOKEN// }" ]]; then
  echo "SKIP: CLOUDFLARE_API_TOKEN unset — agent edge not configured."
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

link_header_value() {
  # Keep in sync with landing-page/demo/functions/_middleware.ts
  printf '%s' \
    "<https://${APEX}/sitemap.xml>; rel=\"sitemap\", " \
    "</llms.txt>; rel=\"alternate\"; type=\"text/plain\", " \
    "</auth.md>; rel=\"alternate\"; type=\"text/markdown\", " \
    "</.well-known/api-catalog>; rel=\"api-catalog\", " \
    "</.well-known/mcp/server-card.json>; rel=\"service-desc\", " \
    "</.well-known/agent-card.json>; rel=\"agent-card\"; type=\"application/json\", " \
    "</.well-known/payments.json>; rel=\"payment-method\", " \
    "<${DOCS}>; rel=\"service-doc\", " \
    "</auth.md>; rel=\"describedby\", " \
    "<${DOCS}/api/health>; rel=\"status\""
}

is_github_pages_origin() {
  local content="$1"
  [[ "$content" == 185.199.* ]] || \
    [[ "$content" == *.github.io ]] || [[ "$content" == *.github.io. ]]
}

if [[ "$PROXY" != "0" ]]; then
  echo "==> Orange-cloud apex DNS records when origin is GitHub Pages"
  RECORDS="$(cf "${API}/zones/${ZONE_ID}/dns_records?name=${APEX}&per_page=100")"
  echo "$RECORDS" | jq -c '.result[]? | select(.type=="A" or .type=="AAAA" or .type=="CNAME")' | while IFS= read -r row; do
    rid="$(echo "$row" | jq -r '.id')"
    rtype="$(echo "$row" | jq -r '.type')"
    proxied="$(echo "$row" | jq -r '.proxied')"
    content="$(echo "$row" | jq -r '.content')"
    if [[ "$PROXY" == "auto" ]] && ! is_github_pages_origin "$content"; then
      echo "    skip ${rtype} ${APEX} -> ${content} (not GitHub Pages; leave for Pages/Worker)"
      continue
    fi
    if [[ "$proxied" == "true" ]]; then
      echo "    ${rtype} ${APEX} -> ${content} already proxied"
      continue
    fi
    body="$(echo "$row" | jq '{type,name,content,ttl:1,proxied:true}')"
    resp="$(cf -X PUT "${API}/zones/${ZONE_ID}/dns_records/${rid}" -d "$body")"
    if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
      echo "$resp" | jq .
      echo "    WARN: failed to proxy ${rtype} ${APEX}"
      continue
    fi
    echo "    Proxied ${rtype} ${APEX} -> ${content}"
  done
fi

if [[ "$MARKDOWN" == "1" ]]; then
  echo "==> Enable Markdown for Agents (content_converter)"
  resp="$(cf -X PATCH "${API}/zones/${ZONE_ID}/settings/content_converter" -d '{"value":"on"}')"
  if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
    # Free plans often reject this — Pages Functions cover markdown instead.
    echo "$resp" | jq -c '{success,errors}' 2>/dev/null || echo "$resp"
    echo "    WARN: content_converter not enabled (plan may lack Markdown for Agents)."
    echo "    Prefer Cloudflare Pages deploy (functions/[[path]].ts) for Accept: text/markdown."
  else
    echo "    content_converter=on"
  fi
fi

if [[ "$LINK_HEADER" == "1" ]]; then
  echo "==> Upsert Link response header transform rule"
  LINK_VALUE="$(link_header_value)"
  RULESETS="$(cf "${API}/zones/${ZONE_ID}/rulesets")"
  PHASE_ID="$(echo "$RULESETS" | jq -r '.result[] | select(.phase=="http_response_headers_transform") | .id' | head -1)"

  RULE_JSON="$(jq -n \
    --arg link "$LINK_VALUE" \
    --arg host "$APEX" \
    '{
      ref: "clawql_agent_link_header",
      description: "isitagentready Link discovery headers for clawql.com",
      expression: ("(http.host eq \"" + $host + "\" or http.host eq \"www." + $host + "\")"),
      action: "rewrite",
      action_parameters: {
        headers: {
          Link: { operation: "set", value: $link }
        }
      }
    }')"

  if [[ -z "$PHASE_ID" || "$PHASE_ID" == "null" ]]; then
    body="$(jq -n --argjson rule "$RULE_JSON" '{
      name: "Zone-level Response Headers Transform Ruleset",
      description: "ClawQL agent-readiness Link headers",
      kind: "zone",
      phase: "http_response_headers_transform",
      rules: [$rule]
    }')"
    resp="$(cf -X POST "${API}/zones/${ZONE_ID}/rulesets" -d "$body")"
  else
    existing="$(cf "${API}/zones/${ZONE_ID}/rulesets/${PHASE_ID}")"
    # Replace our rule by ref; keep others.
    merged="$(echo "$existing" | jq --argjson rule "$RULE_JSON" '
      .result.rules |= ((map(select(.ref != "clawql_agent_link_header" and .description != "isitagentready Link discovery headers for clawql.com")) + [$rule]))
    ' | jq '{rules: .result.rules}')"
    resp="$(cf -X PUT "${API}/zones/${ZONE_ID}/rulesets/${PHASE_ID}" -d "$merged")"
  fi

  if [[ "$(echo "$resp" | jq -r '.success')" != "true" ]]; then
    echo "$resp" | jq .
    echo "    WARN: Link header transform not applied (token may lack Transform Rules Edit)."
  else
    echo "    Link header transform upserted"
  fi
fi

echo "==> DNS-AID records"
bash "${SCRIPT_DIR}/ensure-dns-aid-records.sh" || echo "    WARN: DNS-AID step reported errors"

echo "Done. Agent edge configuration attempted for ${APEX}."
echo "If traffic still hits GitHub Pages directly (server: GitHub.com), orange-cloud failed or DNS cache remains."
echo "Recommended for full score: attach ${APEX} to Cloudflare Pages project clawql-website (functions/ ship Link + markdown)."
