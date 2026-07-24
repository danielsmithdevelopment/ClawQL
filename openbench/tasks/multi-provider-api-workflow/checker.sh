#!/usr/bin/env bash
# Structural checks for Cloudflare Worker + GitHub release-tag scaffold.
set -euo pipefail

pass=0
total=4

# 1) wrangler.toml basics
if [ -f wrangler.toml ] && grep -q 'name *= *"release-tag-worker"' wrangler.toml \
  && grep -q 'main *= *"src/index.js"' wrangler.toml \
  && grep -Eq 'compatibility_date *= *"[0-9]{4}-[0-9]{2}-[0-9]{2}"' wrangler.toml; then
  pass=$((pass + 1))
else
  echo "FAIL: wrangler.toml incomplete" >&2
fi

# 2) worker source exists
if [ -f src/index.js ]; then
  pass=$((pass + 1))
else
  echo "FAIL: src/index.js missing" >&2
fi

# 3) GitHub releases API usage + tag JSON shape
if [ -f src/index.js ] && grep -q 'api.github.com/repos' src/index.js \
  && grep -q 'releases/latest' src/index.js \
  && grep -Eq 'tag_name|"tag"' src/index.js; then
  pass=$((pass + 1))
else
  echo "FAIL: worker does not call GitHub releases/latest appropriately" >&2
fi

# 4) package.json deploy script
if [ -f package.json ] && python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path("package.json").read_text())
scripts = data.get("scripts") or {}
ok = scripts.get("deploy") == "wrangler deploy"
raise SystemExit(0 if ok else 1)
PY
then
  pass=$((pass + 1))
else
  echo "FAIL: package.json deploy script missing" >&2
fi

python3 -c "print(f'SCORE: {$pass/$total}')"
if [ "$pass" -eq "$total" ]; then
  exit 0
fi
exit 1
