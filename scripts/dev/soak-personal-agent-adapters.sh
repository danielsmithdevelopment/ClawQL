#!/usr/bin/env bash
# Offline soak: personal-agent install materialize + OpenClaw plan + package tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$ROOT"
npm run build -w clawql-merkle >/dev/null
npm run build -w clawql-audit >/dev/null
npm run build -w clawql-auth >/dev/null
npm run build -w clawql-agents >/dev/null
npm run test -w clawql-agents >/dev/null

HERMES_EXTENSIONS_DIR="$TMP/hermes" CLINE_CONFIG_PATH="$TMP/cline/config.json" \
  node "$ROOT/scripts/dev/install-personal-agent-hooks.mjs"

test -f "$TMP/hermes/worm_agent.py"
test -f "$TMP/cline/config.json"
node "$ROOT/scripts/dev/openclaw-register-clawql.mjs" http | grep -q "openclaw mcp set clawql"
node "$ROOT/integrations/agents-bench/scripts/dry-run.mjs" cline S >/dev/null

echo "OK personal-agent + OpenClaw + dry OpenBench soak (offline)"
