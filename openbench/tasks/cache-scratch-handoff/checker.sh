#!/usr/bin/env bash
# Grades cache-scratch-handoff: assembled token + optional cache evidence.
set -euo pipefail

REQUIRE_CACHE="${OPENBENCH_REQUIRE_CACHE:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-25}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-6000}"
EXPECTED="alpha42-zeta99"

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
ok = token == "${EXPECTED}" and "cache" in src
if not ok:
    print(f"FAIL: expected token=${EXPECTED} source~cache; got {d!r}", flush=True)
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

if [ "$REQUIRE_CACHE" = "1" ]; then
  AGENT_LOG=""
  if [ -f .openbench_agent.log ]; then
    AGENT_LOG=".openbench_agent.log"
  fi
  if [ -z "$AGENT_LOG" ]; then
    echo "FAIL: missing .openbench_agent.log for cache evidence" >&2
    cap_fail=1
  else
    # OpenCode registers MCP cache as clawql_cache (bare "cache" is invalid).
    cache_hits="$(grep -Fci '"tool":"clawql_cache"' "$AGENT_LOG" || true)"
    if [ "${cache_hits:-0}" -lt 2 ]; then
      echo "FAIL: required ≥2 clawql_cache tool_use calls (got ${cache_hits:-0})" >&2
      cap_fail=1
    fi
    if ! grep -Fq '"operation":"set"' "$AGENT_LOG"; then
      echo "FAIL: required cache operation=set in tool_use input" >&2
      cap_fail=1
    fi
    # Prefer get evidence; allow set×2 + correct answer.json when get is missing
    # (cheap models often set then stall before get).
    if ! grep -Fq '"operation":"get"' "$AGENT_LOG"; then
      set_hits="$(grep -Fci '"operation":"set"' "$AGENT_LOG" || true)"
      if [ "${set_hits:-0}" -lt 2 ] || [ "$pass" -ne 1 ]; then
        echo "FAIL: required cache operation=get (or ≥2 set + correct answer.json)" >&2
        cap_fail=1
      else
        echo "NOTE: cache get missing; accepting ≥2 set + correct answer.json" >&2
      fi
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ] || [ "$pass" -ne 1 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

echo "SCORE: 1.0"
exit 0
