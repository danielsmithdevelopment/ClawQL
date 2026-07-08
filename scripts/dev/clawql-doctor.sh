#!/usr/bin/env bash
# Delegates to the clawql CLI (npm bin). Fallback for repo dev before build.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -x "$ROOT/bin/clawql.mjs" ]] && [[ -f "$ROOT/dist/onboarding/cli.js" ]]; then
  exec node "$ROOT/bin/clawql.mjs" doctor "$@"
fi
if command -v clawql >/dev/null 2>&1; then
  exec clawql doctor "$@"
fi
echo "Run: npm run build && node bin/clawql.mjs doctor" >&2
exit 1
