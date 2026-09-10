#!/usr/bin/env bash
# Grades memory-roundtrip-ingest-recall: correct token + optional ingest/recall evidence.
set -euo pipefail

# Live A/B sets OPENBENCH_REQUIRE_MEMORY_ROUNDTRIP=1 for both arms.
# Offline validate_tasks has no agent log — leave unset so solution overlay passes.
REQUIRE_RT="${OPENBENCH_REQUIRE_MEMORY_ROUNDTRIP:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
EXPECTED="nebula-77-orchid"

cap_fail=0
pass=0

if [ ! -f answer.json ]; then
  echo "FAIL: answer.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<PY
import json
from pathlib import Path
try:
    d = json.loads(Path("answer.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: answer.json parse error: {exc}", flush=True)
    raise SystemExit(1)
token = str(d.get("token") or "").strip()
src = str(d.get("source") or "").strip().lower()
ok = token == "${EXPECTED}" and "memory" in src
if not ok:
    print(f"FAIL: expected token=${EXPECTED} source~memory_*; got {d!r}", flush=True)
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

if [ "$REQUIRE_RT" = "1" ]; then
  log=""
  if [ -f .openbench_agent.log ]; then
    log="$(cat .openbench_agent.log)"
  fi
  if ! printf '%s' "$log" | grep -Fq '"tool":"clawql_memory_ingest"'; then
    echo "FAIL: required clawql_memory_ingest tool_use in the agent log" >&2
    cap_fail=1
  fi
  if ! printf '%s' "$log" | grep -Fq '"tool":"clawql_memory_recall"'; then
    echo "FAIL: required clawql_memory_recall tool_use in the agent log" >&2
    cap_fail=1
  fi
fi

if [ "$cap_fail" -ne 0 ] || [ "$pass" -ne 1 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

echo "SCORE: 1.0"
exit 0
