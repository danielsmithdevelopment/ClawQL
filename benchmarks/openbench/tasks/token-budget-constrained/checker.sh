#!/usr/bin/env bash
# Grades YAML parse_config + optional token-budget SCORE.
set -euo pipefail

TOKEN_BUDGET=5000
pass_func=0

if [ ! -f config_lib/parse.py ]; then
  echo "FAIL: config_lib/parse.py missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 -m config_lib.selftest >/dev/null 2>&1; then
  pass_func=1
else
  echo "FAIL: config_lib.selftest failed" >&2
fi

# Extra fixture check from checker_data (not visible as "expected" prose)
DATA="${TASK_DIR}/checker_data"
if [ -f "$DATA/sample.yaml" ] && [ "$pass_func" -eq 1 ]; then
  if ! python3 - <<PY
from config_lib.parse import parse_config
got = parse_config("$DATA/sample.yaml")
assert got.get("service") == "api"
assert got.get("replicas") in (2, "2")
assert list(got.get("tags", [])) == ["prod", "west"]
print("fixture ok")
PY
  then
    echo "FAIL: checker_data sample.yaml mismatch" >&2
    pass_func=0
  fi
fi

tokens=""
if [ -f .token_usage ]; then
  tokens="$(python3 - <<'PY'
import json
from pathlib import Path
try:
    data = json.loads(Path(".token_usage").read_text())
    t = data.get("tokens")
    print(t if isinstance(t, int) else "")
except Exception:
    print("")
PY
)"
fi

if [ "$pass_func" -ne 1 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

# Functional pass. Token budget adjusts score when usage is known.
if [ -n "$tokens" ]; then
  if [ "$tokens" -le "$TOKEN_BUDGET" ]; then
    echo "SCORE: 1.0"
    exit 0
  fi
  echo "SCORE: 0.5"
  echo "over budget: tokens=$tokens budget=$TOKEN_BUDGET" >&2
  exit 1
fi

# No usage recorded — full credit for correctness (offline / golden validation).
echo "SCORE: 1.0"
exit 0
