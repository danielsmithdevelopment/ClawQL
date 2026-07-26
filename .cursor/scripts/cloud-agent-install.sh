#!/usr/bin/env bash
# Cloud Agent install — idempotent; cached as environment snapshot after first run.
# See docs/deployment/cloud-agent-r2-tailscale-runbook.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "[cloud-agent-install] Node $(node -v)"

# ClawQL MCP + workspace packages
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run build

# Pulumi provision package (R2 bucket tests)
cd infra/pulumi
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm test
npm run build
cd "$ROOT"

# Local ClawQL home for memory vault (ephemeral VM; durable notes via R2 sync)
export CLAWQL_HOME="${CLAWQL_HOME:-$HOME/.ClawQL}"
mkdir -p "$CLAWQL_HOME/Memory" "$CLAWQL_HOME/vault"

if [[ ! -f "$CLAWQL_HOME/clawql.env" ]]; then
  cat >"$CLAWQL_HOME/clawql.env" <<EOF
CLAWQL_OBSIDIAN_VAULT_PATH=$CLAWQL_HOME
CLAWQL_BUNDLED_OFFLINE=1
CLAWQL_ENABLE_MEMORY=1
CLAWQL_ENABLE_OUROBOROS=1
CLAWQL_SYNC_PROVIDER=r2
CLAWQL_SYNC_AUTO=1
CLAWQL_SYNC_AUTO_PULL=1
CLAWQL_SYNC_AUTO_PULL_ON_START=1
EOF
fi

# Ensure workspace MCP config for IDE/stdio (committed mcp.json preferred; fall back to example)
if [[ ! -f "$ROOT/.cursor/mcp.json" && -f "$ROOT/.cursor/mcp.json.example" ]]; then
  cp "$ROOT/.cursor/mcp.json.example" "$ROOT/.cursor/mcp.json"
  echo "[cloud-agent-install] Wrote .cursor/mcp.json from example (stdio clawql-mcp)"
fi
# Always refresh user-level Cursor MCP so Cloud Agent VMs have clawql even when
# the dashboard MCP toggle is the primary attach path for tools/list.
if [[ -f "$ROOT/.cursor/mcp.json" ]]; then
  mkdir -p "$HOME/.cursor"
  cp "$ROOT/.cursor/mcp.json" "$HOME/.cursor/mcp.json"
  echo "[cloud-agent-install] Synced ~/.cursor/mcp.json from workspace (stdio clawql-mcp)"
fi

# Team vault sync — Cursor Secrets inject CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID
# Prefer `sync ensure` so ClawQL can create clawql-team-vault when Admin R2 keys
# or CLOUDFLARE_API_TOKEN (Workers R2 Storage Write) are present.
has_r2_account="${CLAWQL_R2_ACCOUNT_ID:-${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-}}}"
has_sync_keys=false
if [[ -n "${CLAWQL_SYNC_ACCESS_KEY_ID:-}" && -n "${CLAWQL_SYNC_SECRET_ACCESS_KEY:-}" ]]; then
  has_sync_keys=true
fi
has_cf_api="${CLAWQL_CLOUDFLARE_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

if [[ -n "$has_r2_account" && ( "$has_sync_keys" == true || -n "$has_cf_api" ) ]]; then
  echo "[cloud-agent-install] Ensuring R2 team vault bucket + sync.json"
  ensure_args=(sync ensure --yes --provider r2)
  if [[ -n "${CLAWQL_SYNC_BUCKET:-}" ]]; then
    ensure_args+=(--bucket "${CLAWQL_SYNC_BUCKET}")
  fi
  if [[ -n "${CLAWQL_SYNC_PREFIX:-}" ]]; then
    ensure_args+=(--prefix "${CLAWQL_SYNC_PREFIX}")
  fi
  node "$ROOT/bin/clawql.mjs" "${ensure_args[@]}" \
    || echo "[cloud-agent-install] sync ensure skipped (need Admin R2 keys or CLOUDFLARE_API_TOKEN)"
  if [[ "$has_sync_keys" == true ]]; then
    node "$ROOT/bin/clawql.mjs" sync pull \
      || echo "[cloud-agent-install] sync pull skipped (bucket empty or first run)"
  else
    echo "[cloud-agent-install] Sync object keys not set — bucket may exist, but pull needs CLAWQL_SYNC_ACCESS_KEY_ID / SECRET"
  fi
elif [[ -n "${CLAWQL_SYNC_BUCKET:-}" && "$has_sync_keys" == true ]]; then
  echo "[cloud-agent-install] R2 sync bucket preset — writing sync.json + pulling"
  node "$ROOT/bin/clawql.mjs" sync init --yes \
    --bucket "${CLAWQL_SYNC_BUCKET}" \
    ${CLAWQL_SYNC_PREFIX:+--prefix "${CLAWQL_SYNC_PREFIX}"} \
    || echo "[cloud-agent-install] sync init skipped"
  node "$ROOT/bin/clawql.mjs" sync pull \
    || echo "[cloud-agent-install] sync pull skipped (bucket empty or first run)"
else
  echo "[cloud-agent-install] R2 sync secrets not set — skipping ensure/pull"
  echo "[cloud-agent-install]   Add in Cursor → Cloud Agents → Secrets:"
  echo "[cloud-agent-install]   CLAWQL_R2_ACCOUNT_ID"
  echo "[cloud-agent-install]   CLAWQL_SYNC_ACCESS_KEY_ID + CLAWQL_SYNC_SECRET_ACCESS_KEY"
  echo "[cloud-agent-install]     (R2 token with Admin Read & Write so sync ensure can create the bucket)"
  echo "[cloud-agent-install]   OR CLOUDFLARE_API_TOKEN with Workers R2 Storage Write (bucket create)"
  echo "[cloud-agent-install]   Optional: CLAWQL_SYNC_BUCKET (default clawql-team-vault),"
  echo "[cloud-agent-install]            CLAWQL_SYNC_PREFIX (default teams/shared/),"
  echo "[cloud-agent-install]            CLAWQL_SYNC_AUTO=1, CLAWQL_SYNC_AUTO_PULL=1,"
  echo "[cloud-agent-install]            CLAWQL_SYNC_AUTO_PULL_ON_START=1, OPENROUTER_API_KEY"
fi

# Fallback if workspace mcp.json was missing above
if [[ ! -f "$HOME/.cursor/mcp.json" ]]; then
  mkdir -p "$HOME/.cursor"
  node "$ROOT/bin/clawql.mjs" mcp-config --write cursor \
    || echo "[cloud-agent-install] mcp-config write skipped"
fi

echo "[cloud-agent-install] done"
echo "[cloud-agent-install] NOTE: memory_* tools require clawql enabled in cursor.com/agents MCP (repo mcp.json alone is not enough)."
