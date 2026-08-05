#!/usr/bin/env bash
# Grades codegraph-feature-api-surface: full GET /widgets/:id wiring + optional
# real codegraph tool evidence when OPENBENCH_REQUIRE_CODEGRAPH=1.
set -euo pipefail

REQUIRE_CG="${OPENBENCH_REQUIRE_CODEGRAPH:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-40}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-10000}"

pass=0
total=4
cap_fail=0

# 1) Handler implements getWidgetById
if [ -f src/handler.js ] && grep -q 'function getWidgetById' src/handler.js \
  && grep -q 'WIDGETS' src/handler.js; then
  pass=$((pass + 1))
else
  echo "FAIL: src/handler.js missing getWidgetById implementation" >&2
fi

# 2) Router registers the route
if [ -f src/router.js ] && grep -q '/widgets/:id' src/router.js \
  && grep -q 'getWidgetById' src/router.js; then
  pass=$((pass + 1))
else
  echo "FAIL: src/router.js does not register GET /widgets/:id" >&2
fi

# 3) Schema + OpenAPI
schema_ok=0
if [ -f src/schema.js ] && grep -q 'WidgetParams' src/schema.js; then
  schema_ok=1
fi
openapi_ok=0
if [ -f openapi/openapi.yaml ] && grep -q '/widgets/{id}' openapi/openapi.yaml \
  && grep -q '404' openapi/openapi.yaml; then
  openapi_ok=1
fi
if [ "$schema_ok" -eq 1 ] && [ "$openapi_ok" -eq 1 ]; then
  pass=$((pass + 1))
else
  echo "FAIL: schema and/or openapi incomplete for widgets/:id" >&2
fi

# 4) Tests pass + cover not-found
if [ -f tests/widgets.test.js ] && grep -q 'not found\|null\|404' tests/widgets.test.js; then
  if node --test tests/widgets.test.js >/tmp/clawql-cg-test.out 2>&1; then
    pass=$((pass + 1))
  else
    echo "FAIL: tests/widgets.test.js failed" >&2
    cat /tmp/clawql-cg-test.out >&2 || true
  fi
else
  echo "FAIL: tests/widgets.test.js missing not-found coverage" >&2
fi

if [ -f .openbench_usage.json ]; then
  eval "$(python3 - <<'PY'
import json
from pathlib import Path
try:
    d = json.loads(Path(".openbench_usage.json").read_text())
except Exception:
    d = {}
turns = d.get("turns")
tokens = d.get("tokens")
timed_out = bool(d.get("timed_out"))
print(f"usage_turns={turns if isinstance(turns, int) else ''}")
print(f"usage_tokens={tokens if isinstance(tokens, int) else ''}")
print(f"usage_timed_out={'1' if timed_out else '0'}")
PY
)"
  if [ "${usage_timed_out:-0}" = "1" ]; then
    echo "FAIL: hard cap — agent timed out" >&2
    cap_fail=1
  fi
  if [ -n "${usage_turns:-}" ] && [ "$usage_turns" -gt "$HARD_MAX_TURNS" ]; then
    echo "FAIL: hard cap — turns=$usage_turns > max=$HARD_MAX_TURNS" >&2
    cap_fail=1
  fi
  if [ -n "${usage_tokens:-}" ] && [ "$usage_tokens" -gt "$HARD_MAX_TOKENS" ]; then
    echo "FAIL: hard cap — tokens=$usage_tokens > max=$HARD_MAX_TOKENS" >&2
    cap_fail=1
  fi
fi

if [ "$REQUIRE_CG" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for codegraph evidence" >&2
    cap_fail=1
  else
    helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="${TASK_DIR:-}/../../scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log \
      'clawql_codegraph_index|codegraph_index' \
      'clawql_codegraph_query|codegraph_query|clawql_codegraph_explain|codegraph_explain|clawql_codegraph_neighbors|codegraph_neighbors|clawql_codegraph_path|codegraph_path'
    then
      echo "FAIL: required real codegraph index + query/explain/neighbors/path tool_use" >&2
      cap_fail=1
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ] || [ "$pass" -ne "$total" ]; then
  if [ "$cap_fail" -ne 0 ]; then
    echo "SCORE: 0.0"
  else
    python3 -c "print(f'SCORE: {$pass/$total}')"
  fi
  exit 1
fi

echo "SCORE: 1.0"
exit 0
