#!/usr/bin/env bash
# Grades codegraph-feature-api-surface: full GET /widgets/:id wiring.
set -euo pipefail

pass=0
total=4

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

python3 -c "print(f'SCORE: {$pass/$total}')"
if [ "$pass" -eq "$total" ]; then
  exit 0
fi
exit 1
