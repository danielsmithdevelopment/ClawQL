#!/usr/bin/env bash
# Grades memory-stale-after-update: write must invalidate cache.
set -euo pipefail

pass=0
total=2

if [ ! -f src/client.py ]; then
  echo "FAIL: src/client.py missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

# 1) Selftest passes (update then read reflects write)
if python3 -m src.selftest >/tmp/clawql-stale-selftest.out 2>&1; then
  pass=$((pass + 1))
else
  echo "FAIL: src.selftest failed" >&2
  cat /tmp/clawql-stale-selftest.out >&2 || true
fi

# 2) Implementation mentions invalidation (not only store write)
if grep -Eqi 'invalidate|cache\.pop|del cache|cache\.clear|pop\(' src/client.py; then
  pass=$((pass + 1))
else
  echo "FAIL: client.py does not appear to invalidate cache on update" >&2
fi

python3 -c "print(f'SCORE: {$pass/$total}')"
if [ "$pass" -eq "$total" ]; then
  exit 0
fi
exit 1
