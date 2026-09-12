#!/usr/bin/env bash
# Grades memory-conflict-pricing: memory_recall + both prices + conflict flag.
set -euo pipefail

REQUIRE_CONFLICT="${OPENBENCH_REQUIRE_CONFLICT:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"

cap_fail=0
pass=0

if [ ! -f conflict.json ]; then
  echo "FAIL: conflict.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<'PY'
import json
from pathlib import Path

try:
    d = json.loads(Path("conflict.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: conflict.json parse error: {exc}", flush=True)
    raise SystemExit(1)

conflict = d.get("conflict")
ok_conflict = conflict is True or str(conflict).lower() in ("true", "1", "yes")
src = str(d.get("source") or "").strip().lower()
ok_src = "memory" in src or "recall" in src

raw_values = d.get("values")
if not isinstance(raw_values, list):
    print(f"FAIL: values must be a list; got {d!r}", flush=True)
    raise SystemExit(1)

prices = set()
for item in raw_values:
    if isinstance(item, dict):
        p = item.get("price")
        if p is None:
            p = item.get("usd")
        try:
            prices.add(int(p))
        except (TypeError, ValueError):
            pass
    else:
        try:
            prices.add(int(item))
        except (TypeError, ValueError):
            pass

# Also accept prices embedded in the JSON blob as a weak fallback only if values empty
if not prices:
    blob = json.dumps(d)
    for n in (42, 55):
        if str(n) in blob:
            prices.add(n)

expected = {42, 55}
if 48 in prices or 99 in prices:
    print(f"FAIL: synthesized/decoy price present; got prices={sorted(prices)}", flush=True)
    raise SystemExit(1)

# Reject single-price invents (even if conflict flag lied)
if prices == {42} or prices == {55}:
    print(f"FAIL: only one vault price reported; need both 42 and 55; got {d!r}", flush=True)
    raise SystemExit(1)

ok_prices = prices == expected or expected.issubset(prices)
ok = ok_conflict and ok_src and ok_prices
if not ok:
    print(
        f"FAIL: expected conflict=true source~memory_recall prices={{42,55}}; "
        f"got conflict={conflict!r} prices={sorted(prices)} src={src!r} raw={d!r}",
        flush=True,
    )
raise SystemExit(0 if ok else 1)
PY
then
  pass=1
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

if [ "$REQUIRE_CONFLICT" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for conflict evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log 'clawql_memory_recall|memory_recall'; then
      echo "FAIL: required real memory_recall tool_use" >&2
      cap_fail=1
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ] || [ "$pass" -ne 1 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

echo "SCORE: 1.0"
exit 0
