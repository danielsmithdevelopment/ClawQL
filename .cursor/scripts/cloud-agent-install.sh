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

# Pull team vault from R2 when sync credentials are present (Cursor Secrets)
if [[ -n "${CLAWQL_SYNC_BUCKET:-}" && -n "${CLAWQL_SYNC_ACCESS_KEY_ID:-}" && -n "${CLAWQL_SYNC_SECRET_ACCESS_KEY:-}" ]]; then
  echo "[cloud-agent-install] R2 sync configured — pulling team vault"
  npx clawql sync pull || echo "[cloud-agent-install] sync pull skipped (bucket empty or first run)"
else
  echo "[cloud-agent-install] R2 sync secrets not set — skipping pull (configure in Cursor Secrets)"
fi

echo "[cloud-agent-install] done"
