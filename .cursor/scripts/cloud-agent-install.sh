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

# Ensure workspace MCP example is available for Cloud Agent stdio (gitignored copy)
if [[ ! -f "$ROOT/.cursor/mcp.json" && -f "$ROOT/.cursor/mcp.json.example" ]]; then
  cp "$ROOT/.cursor/mcp.json.example" "$ROOT/.cursor/mcp.json"
  echo "[cloud-agent-install] Wrote .cursor/mcp.json from example (stdio clawql-mcp)"
fi

# Team vault sync — Cursor Secrets inject CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID
if [[ -n "${CLAWQL_SYNC_BUCKET:-}" && -n "${CLAWQL_SYNC_ACCESS_KEY_ID:-}" && -n "${CLAWQL_SYNC_SECRET_ACCESS_KEY:-}" ]]; then
  if [[ -z "${CLAWQL_R2_ACCOUNT_ID:-}${CLAWQL_CLOUDFLARE_ACCOUNT_ID:-}${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    echo "[cloud-agent-install] WARN: CLAWQL_R2_ACCOUNT_ID missing — R2 endpoint cannot be resolved"
  fi
  echo "[cloud-agent-install] R2 sync configured — writing sync.json + pulling team vault"
  node "$ROOT/bin/clawql.mjs" sync init --yes \
    --bucket "${CLAWQL_SYNC_BUCKET}" \
    ${CLAWQL_SYNC_PREFIX:+--prefix "${CLAWQL_SYNC_PREFIX}"} \
    || echo "[cloud-agent-install] sync init skipped"
  node "$ROOT/bin/clawql.mjs" sync pull \
    || echo "[cloud-agent-install] sync pull skipped (bucket empty or first run)"
else
  echo "[cloud-agent-install] R2 sync secrets not set — skipping pull"
  echo "[cloud-agent-install]   Add in Cursor → Cloud Agents → Secrets:"
  echo "[cloud-agent-install]   CLAWQL_R2_ACCOUNT_ID, CLAWQL_SYNC_BUCKET, CLAWQL_SYNC_PREFIX,"
  echo "[cloud-agent-install]   CLAWQL_SYNC_ACCESS_KEY_ID, CLAWQL_SYNC_SECRET_ACCESS_KEY,"
  echo "[cloud-agent-install]   CLAWQL_SYNC_AUTO=1, CLAWQL_SYNC_AUTO_PULL=1, CLAWQL_SYNC_AUTO_PULL_ON_START=1"
  echo "[cloud-agent-install]   Optional: OPENROUTER_API_KEY (inference), CLOUDFLARE_API_TOKEN (execute)"
fi

# Stdio MCP config for this VM user (Cursor Cloud Agent)
if [[ ! -f "$HOME/.cursor/mcp.json" ]]; then
  mkdir -p "$HOME/.cursor"
  node "$ROOT/bin/clawql.mjs" mcp-config --write cursor \
    || echo "[cloud-agent-install] mcp-config write skipped"
fi

echo "[cloud-agent-install] done"
