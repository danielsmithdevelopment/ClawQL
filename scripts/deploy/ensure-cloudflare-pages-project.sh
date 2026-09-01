#!/usr/bin/env bash
# Ensure a Cloudflare Pages project exists before wrangler pages deploy.
#
# Auth (same as deploy-docs / landing-page workflow):
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
#
# Optional:
#   CLAWQL_LANDING_PAGES_PROJECT   (default: clawql-website)
#   CLAWQL_LANDING_PAGES_BRANCH    (default: main)
set -euo pipefail

PROJECT_NAME="${CLAWQL_LANDING_PAGES_PROJECT:-clawql-website}"
PRODUCTION_BRANCH="${CLAWQL_LANDING_PAGES_BRANCH:-main}"
TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"

if [[ -z "${TOKEN// }" || -z "${ACCOUNT_ID// }" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required."
  exit 1
fi

export CLOUDFLARE_API_TOKEN="$TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

WRANGLER="${WRANGLER_CMD:-npx --yes wrangler@4}"

project_exists() {
  local json
  json="$($WRANGLER pages project list --json 2>/dev/null || true)"
  if [[ -z "${json// }" ]]; then
    return 1
  fi
  if command -v jq >/dev/null 2>&1; then
    if echo "$json" | jq -e --arg n "$PROJECT_NAME" '
      if type == "array" then .[]
      elif (.result? | type) == "array" then .result[]
      else empty end | select(.name == $n)
    ' >/dev/null 2>&1; then
      return 0
    fi
  fi
  echo "$json" | grep -Fq "\"name\":\"${PROJECT_NAME}\"" || echo "$json" | grep -Fq "\"name\": \"${PROJECT_NAME}\""
}

if project_exists; then
  echo "Cloudflare Pages project already exists: ${PROJECT_NAME}"
  exit 0
fi

echo "Creating Cloudflare Pages project: ${PROJECT_NAME} (production branch: ${PRODUCTION_BRANCH})"
if $WRANGLER pages project create "$PROJECT_NAME" --production-branch "$PRODUCTION_BRANCH"; then
  echo "Created Cloudflare Pages project: ${PROJECT_NAME}"
  exit 0
fi

if project_exists; then
  echo "Create reported an error but project ${PROJECT_NAME} is present — continuing."
  exit 0
fi

echo "ERROR: Failed to create Cloudflare Pages project ${PROJECT_NAME}."
exit 1
