#!/usr/bin/env bash
# Grades schedule-synthetic-dry-run: dry_run pass + schedule tool evidence.
set -euo pipefail

REQUIRE_SCH="${OPENBENCH_REQUIRE_SCHEDULE:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"

cap_fail=0
pass=0

if [ ! -f schedule.json ]; then
  echo "FAIL: schedule.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<PY
import json
from pathlib import Path
try:
    d = json.loads(Path("schedule.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: schedule.json parse error: {exc}", flush=True)
    raise SystemExit(1)
dry = d.get("dry_run")
status = str(d.get("status") or "").strip().lower()
src = str(d.get("source") or "").strip().lower()
job = str(d.get("job_id") or d.get("id") or "").strip()
ok_dry = dry is True or str(dry).lower() in ("true", "1", "yes")
ok = ok_dry and status == "pass" and "schedule" in src and bool(job)
if not ok:
    print(f"FAIL: expected dry_run=true status=pass source~schedule job_id; got {d!r}", flush=True)
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

if [ "$REQUIRE_SCH" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for schedule evidence" >&2
    cap_fail=1
  else
    if ! grep -Eq '"tool":"clawql_schedule"|"tool":"schedule"' .openbench_agent.log; then
      echo "FAIL: required schedule/clawql_schedule tool_use" >&2
      cap_fail=1
    fi
    # Prefer seeing both create and trigger; accept ≥2 schedule calls.
    hits="$(grep -Ec '"tool":"clawql_schedule"|"tool":"schedule"' .openbench_agent.log || true)"
    if [ "${hits:-0}" -lt 2 ]; then
      echo "FAIL: required ≥2 schedule tool_use calls (create + trigger)" >&2
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
