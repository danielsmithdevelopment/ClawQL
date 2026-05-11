#!/usr/bin/env bash
set -euo pipefail
# Fail CI / local release if bundled dist drops cache/audit registration literals.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILE="${ROOT}/dist/tools.js"
if [[ ! -f "${FILE}" ]]; then
  echo "ERROR: ${FILE} not found (run npm run build first)" >&2
  exit 1
fi
for needle in 'server.tool("cache"' 'server.tool("audit"'; do
  if ! grep -qF "${needle}" "${FILE}"; then
    echo "ERROR: dist/tools.js must contain ${needle} — non-negotiable MCP tools (#75 #89)" >&2
    exit 1
  fi
done
echo "OK: dist/tools.js contains cache + audit registration."
