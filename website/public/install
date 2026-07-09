#!/usr/bin/env bash
# ClawQL one-line installer — curl -fsSL https://clawql.com/install | bash
# Installs clawql-mcp globally when npm is available; otherwise prints npx instructions.
set -euo pipefail

CLAWQL_VERSION="${CLAWQL_VERSION:-latest}"
NPM_PKG="clawql-mcp@${CLAWQL_VERSION}"

echo "ClawQL installer"
echo "================"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install from https://nodejs.org/ then re-run this script."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js >= 22 required (found $(node -v))."
  exit 1
fi

if command -v npm >/dev/null 2>&1; then
  echo "Installing ${NPM_PKG} via npm..."
  npm install -g "${NPM_PKG}"
  echo ""
  echo "Installed. Next steps:"
  echo "  clawql onboard --interactive"
  echo "  clawql claude    # or: clawql cursor | clawql codex | clawql opencode"
  echo "  clawql doctor --smoke"
else
  echo "npm not found. Use npx instead:"
  echo "  npx -p clawql-mcp clawql onboard --interactive"
fi

echo ""
echo "Add an integration from any URL:"
echo "  clawql sources add https://example.com/openapi.json"
echo ""
echo "Docs: https://docs.clawql.com/install"
