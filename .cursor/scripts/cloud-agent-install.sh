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

# Root package bins must be executable + linked for `npx -p clawql-mcp clawql-mcp`.
# In this monorepo, npm resolves -p clawql-mcp to the workspace root; without
# node_modules/.bin/clawql-mcp the MCP child exits 127 ("clawql-mcp: not found").
chmod +x "$ROOT/bin/clawql.mjs" "$ROOT/bin/clawql-mcp.mjs" "$ROOT/bin/clawql-mcp-http.mjs"
mkdir -p "$ROOT/node_modules/.bin"
ln -sfn ../../bin/clawql.mjs "$ROOT/node_modules/.bin/clawql"
ln -sfn ../../bin/clawql-mcp.mjs "$ROOT/node_modules/.bin/clawql-mcp"
ln -sfn ../../bin/clawql-mcp-http.mjs "$ROOT/node_modules/.bin/clawql-mcp-http"

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

# Stdio MCP config for this VM user (Cursor Cloud Agent).
# Prefer the workspace binary after `npm run build` — Cloud Agent PATH uses
# `/exec-daemon/npx`, and `npx -p clawql-mcp clawql-mcp` often fails with
# `clawql-mcp: not found` (or a broken nested `@smithy/protocol-http` install
# from the published tarball). Local `node bin/clawql-mcp.mjs` is reliable.
mkdir -p "$HOME/.cursor"
if [[ -f "$ROOT/dist/server.js" ]]; then
  cat >"$HOME/.cursor/mcp.json" <<EOF
{
  "mcpServers": {
    "clawql": {
      "command": "node",
      "args": ["$ROOT/bin/clawql-mcp.mjs"],
      "env": {
        "CLAWQL_HOME": "$CLAWQL_HOME"
      }
    }
  }
}
EOF
  # Repo-local copy (gitignored) — same transport the Cloud Agent UI may load.
  if [[ ! -f "$ROOT/.cursor/mcp.json" || -f "$ROOT/.cursor/mcp.json.example" ]]; then
    cat >"$ROOT/.cursor/mcp.json" <<EOF
{
  "mcpServers": {
    "clawql": {
      "command": "node",
      "args": ["$ROOT/bin/clawql-mcp.mjs"],
      "env": {
        "CLAWQL_HOME": "$CLAWQL_HOME"
      }
    }
  }
}
EOF
  fi
  echo "[cloud-agent-install] Wrote MCP stdio config → node $ROOT/bin/clawql-mcp.mjs"
else
  if [[ ! -f "$HOME/.cursor/mcp.json" ]]; then
    node "$ROOT/bin/clawql.mjs" mcp-config --write cursor \
      || echo "[cloud-agent-install] mcp-config write skipped"
  fi
fi

echo "[cloud-agent-install] done"
