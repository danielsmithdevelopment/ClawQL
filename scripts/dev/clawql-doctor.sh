#!/usr/bin/env bash
# ClawQL onboarding health checks (Phase 1 — scripts/dev).
# Usage: bash scripts/dev/clawql-doctor.sh [--verbose]
set -euo pipefail

VERBOSE=0
if [[ "${1:-}" == "--verbose" || "${1:-}" == "-v" ]]; then
  VERBOSE=1
fi

ok() { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1"; }

section() { printf '\n%s\n' "$1"; }

section "ClawQL doctor"

# Node
if command -v node >/dev/null 2>&1; then
  NODE_V=$(node -v | sed 's/^v//')
  NODE_MAJOR=${NODE_V%%.*}
  if [[ "$NODE_MAJOR" -ge 22 ]]; then
    ok "Node $NODE_V (>= 22)"
  else
    warn "Node $NODE_V — ClawQL requires Node >= 22"
  fi
else
  fail "node not found on PATH"
fi

# clawql-mcp resolvable
if command -v clawql-mcp >/dev/null 2>&1; then
  ok "clawql-mcp on PATH ($(command -v clawql-mcp))"
elif npx -p clawql-mcp --yes clawql-mcp --help >/dev/null 2>&1; then
  ok "clawql-mcp via npx -p clawql-mcp"
else
  warn "clawql-mcp not on PATH — try: npm install clawql-mcp or npx -p clawql-mcp clawql-mcp"
fi

# Spec mode inference from env
section "Spec / provider mode"
if [[ -n "${CLAWQL_SPEC_PATH:-}" || -n "${CLAWQL_SPEC_URL:-}" || -n "${CLAWQL_DISCOVERY_URL:-}" ]]; then
  ok "Single-spec mode (CLAWQL_SPEC_* / CLAWQL_DISCOVERY_URL)"
elif [[ -n "${CLAWQL_SPEC_PATHS:-}" ]]; then
  ok "Multi-spec explicit paths (CLAWQL_SPEC_PATHS)"
elif [[ -n "${CLAWQL_BUNDLED_PROVIDERS:-}" ]]; then
  ok "Custom bundled merge (CLAWQL_BUNDLED_PROVIDERS=${CLAWQL_BUNDLED_PROVIDERS})"
elif [[ -n "${CLAWQL_PROVIDER:-}" ]]; then
  ok "CLAWQL_PROVIDER=${CLAWQL_PROVIDER}"
else
  ok "Default opinionated stack (Cloudflare, GitHub, Slack, Linear, Notion, Onyx)"
  warn "For full bundle use CLAWQL_PROVIDER=all-providers"
fi

# HTTP health
section "HTTP transport (optional)"
MCP_URL="${CLAWQL_MCP_URL:-}"
if [[ -z "$MCP_URL" && -n "${PORT:-}" ]]; then
  MCP_URL="http://127.0.0.1:${PORT}"
fi
if [[ -z "$MCP_URL" ]]; then
  warn "CLAWQL_MCP_URL unset — skip /healthz (stdio mode is fine)"
else
  HEALTH_URL="${MCP_URL%/}/healthz"
  if curl -sf --max-time 5 "$HEALTH_URL" >/tmp/clawql-doctor-health.json 2>/dev/null; then
    ok "GET $HEALTH_URL"
    if [[ "$VERBOSE" -eq 1 ]]; then
      cat /tmp/clawql-doctor-health.json
      printf '\n'
    fi
  else
    fail "GET $HEALTH_URL failed — is clawql-mcp-http running?"
  fi
fi

# Auth hints for default-stack vendors
section "Auth env (warnings only)"
check_env() {
  local name=$1
  local label=$2
  if [[ -n "${!name:-}" ]]; then
    ok "$label ($name set)"
  else
    warn "$label — set $name for live execute"
  fi
}
check_env GITHUB_TOKEN "GitHub"
check_env SLACK_BOT_TOKEN "Slack"
check_env LINEAR_API_KEY "Linear"
check_env NOTION_API_TOKEN "Notion"
check_env ONYX_API_TOKEN "Onyx"
check_env CLOUDFLARE_API_TOKEN "Cloudflare"

# Vault / memory
section "Vault / memory (optional)"
if [[ "${CLAWQL_ENABLE_MEMORY:-}" == "0" ]]; then
  ok "Memory tools disabled (CLAWQL_ENABLE_MEMORY=0)"
else
  VAULT="${CLAWQL_OBSIDIAN_VAULT_PATH:-}"
  if [[ -n "$VAULT" && -d "$VAULT" && -w "$VAULT" ]]; then
    ok "Vault path writable: $VAULT"
  elif [[ -n "$VAULT" ]]; then
    warn "CLAWQL_OBSIDIAN_VAULT_PATH=$VAULT not writable or missing"
  else
    warn "CLAWQL_OBSIDIAN_VAULT_PATH unset — memory_ingest/recall need a writable vault"
  fi
fi

section "Next steps"
printf '  • Agent setup prompt: docs/getting-started/agent-setup-prompt.md\n'
printf '  • MCP clients: https://docs.clawql.com/mcp-clients\n'
printf '  • Init walkthrough spec: docs/getting-started/clawql-init-walkthrough-spec.md\n'
printf '\n'
