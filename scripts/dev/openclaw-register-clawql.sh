#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
npm run build -w clawql-audit >/dev/null
npm run build -w clawql-auth >/dev/null
npm run build -w clawql-agents >/dev/null
exec node "$ROOT/scripts/dev/openclaw-register-clawql.mjs" "${1:-http}"
