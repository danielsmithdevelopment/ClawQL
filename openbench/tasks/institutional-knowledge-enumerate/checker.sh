#!/usr/bin/env bash
# Grades institutional-knowledge-enumerate: memory_recall + exact matter set.
set -euo pipefail

REQUIRE_INSTITUTIONAL="${OPENBENCH_REQUIRE_INSTITUTIONAL:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"

cap_fail=0
pass=0

if [ ! -f matters.json ]; then
  echo "FAIL: matters.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<'PY'
import json
from pathlib import Path

expected = {"MAT-2388", "MAT-2401", "MAT-2415", "MAT-2450", "MAT-2462"}
near_miss = {
    "MAT-2390",
    "MAT-2405",
    "MAT-2410",
    "MAT-2420",
    "MAT-2433",
    "MAT-2444",
    "MAT-2470",
}

try:
    d = json.loads(Path("matters.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: matters.json parse error: {exc}", flush=True)
    raise SystemExit(1)

raw = d.get("matters")
if not isinstance(raw, list):
    print(f"FAIL: matters must be a list; got {d!r}", flush=True)
    raise SystemExit(1)

ids = set()
for item in raw:
    if isinstance(item, str):
        ids.add(item.strip().upper())
    elif isinstance(item, dict):
        mid = item.get("id") or item.get("matter_id") or item.get("matter")
        if mid:
            ids.add(str(mid).strip().upper())

if ids & near_miss:
    print(f"FAIL: near-miss matter(s) included: {sorted(ids & near_miss)}", flush=True)
    raise SystemExit(1)

if ids != expected:
    print(
        f"FAIL: expected exact set {sorted(expected)}; got {sorted(ids)}",
        flush=True,
    )
    raise SystemExit(1)

src = str(d.get("source") or "").strip().lower()
ok_src = "memory" in src or "recall" in src
if not ok_src:
    print(f"FAIL: source must reference memory_recall; got {src!r}", flush=True)
    raise SystemExit(1)

raise SystemExit(0)
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

if [ "$REQUIRE_INSTITUTIONAL" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for institutional evidence" >&2
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
