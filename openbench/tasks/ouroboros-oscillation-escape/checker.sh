#!/usr/bin/env bash
# Grades ouroboros-oscillation-escape: functional fix + hard spend/loop caps.
set -euo pipefail

HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-20}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-4000}"
REQUIRE_OUROBOROS="${OPENBENCH_REQUIRE_OUROBOROS:-0}"

pass_func=0
cap_fail=0

if [ ! -f scheduler_lib/limiter.py ]; then
  echo "FAIL: scheduler_lib/limiter.py missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 -m scheduler_lib.selftest >/dev/null 2>&1; then
  pass_func=1
else
  echo "FAIL: scheduler_lib.selftest failed" >&2
fi

# Hard caps from harness-written usage (auto-fail — spend guard).
if [ -f .openbench_usage.json ]; then
  eval "$(python3 - <<'PY'
import json
from pathlib import Path
p = Path(".openbench_usage.json")
try:
    d = json.loads(p.read_text())
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
    echo "FAIL: hard cap — agent timed out (spend/loop guard)" >&2
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

# ouroboros-on must invoke the evolutionary loop (not just memory).
if [ "$REQUIRE_OUROBOROS" = "1" ]; then
  log=""
  if [ -f .openbench_agent.log ]; then
    log="$(cat .openbench_agent.log)"
  fi
  if ! printf '%s' "$log" | grep -Eq 'ouroboros_run_evolutionary_loop|clawql_ouroboros_run_evolutionary_loop'; then
    echo "FAIL: ouroboros-on required ouroboros_run_evolutionary_loop in agent log" >&2
    cap_fail=1
  fi
fi

if [ "$cap_fail" -ne 0 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

if [ "$pass_func" -ne 1 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

echo "SCORE: 1.0"
exit 0
