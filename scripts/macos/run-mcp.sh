#!/usr/bin/env bash
# ClawQL MCP HTTP server — supervised runtime for launchd.
#
# Launchd plist: com.clawql.mcp-http (see clawql-mcp-http.plist)
# This script is the single source of truth for how the supervisor starts the
# MCP server: it resolves the repo, loads .env, and execs node so signals and
# exit codes flow straight back to launchd (KeepAlive restarts on crash/exit).
#
# Secrets live in <repo>/.env (gitignored) — never in this script or the plist.
set -euo pipefail

# CLAWQL_HOME overrides where the repo is rooted (default: ~/ClawQL).
CLAWQL_HOME="${CLAWQL_HOME:-$HOME/ClawQL}"
cd "$CLAWQL_HOME"

# Node resolved via PATH (launchd plist sets PATH to include /opt/homebrew/bin).
NODE="${NODE_BIN:-node}"

# Load the repo .env (auth mode, API key, R2/sync creds, instance spec).
# `set -a` exports every var so the node process inherits them.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Instance composition + SQL alias (parity with the manual start command).
export CLAWQL_INSTANCE_SPEC_FILE="${CLAWQL_INSTANCE_SPEC_FILE:-$HOME/.ClawQL/instance-personal.json}"
export CLAWQL_ENABLE_CLAWQL_SQL_ALIAS="${CLAWQL_ENABLE_CLAWQL_SQL_ALIAS:-1}"

# Rebuild dist only when the entry module is missing (purge-safe).
if [ ! -f dist/server-http.js ]; then
  echo "[clawql-mcp-http] dist/server-http.js missing — running npm run build" >&2
  npm run build >&2
fi

echo "[clawql-mcp-http] starting $(date -u +%Y-%m-%dT%H:%M:%SZ) repo=$CLAWQL_HOME auth_mode=${CLAWQL_AUTH_MODE:-noAuth}" >&2
exec "$NODE" bin/clawql-mcp-http.mjs
