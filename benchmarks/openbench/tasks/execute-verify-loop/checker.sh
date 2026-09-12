#!/usr/bin/env bash
# Grades execute-verify-loop: correct trail.json + optional execute evidence.
set -euo pipefail

REQUIRE_EXECUTE="${OPENBENCH_REQUIRE_EXECUTE:-0}"
REQUIRE_SEARCH="${OPENBENCH_REQUIRE_SEARCH:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-40}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-10000}"

cap_fail=0
pass=0

if [ ! -f trail.json ]; then
  echo "FAIL: trail.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<'PY'
import json
import re
from pathlib import Path

def norm(s: str) -> str:
    s = str(s or "").strip().lower().replace("/", "_").replace("-", "_")
    return re.sub(r"_+", "_", s)

try:
    d = json.loads(Path("trail.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: trail.json parse error: {exc}", flush=True)
    raise SystemExit(1)
read_op = norm(d.get("readOperationId"))
list_op = norm(d.get("listOperationId"))
prov = str(d.get("provider") or "").strip().lower()
dry = d.get("dryRunOnly")
ok = (
    read_op == "security_advisories_get_global_advisory"
    and list_op == "security_advisories_list_global_advisories"
    and prov in ("github", "gh", "")
    and dry is True
)
if not ok:
    print(
        "FAIL: expected github get+list global advisory ops with dryRunOnly=true; "
        f"got {d!r}",
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

if [ "$REQUIRE_SEARCH" = "1" ] || [ "$REQUIRE_EXECUTE" = "1" ]; then
  AGENT_LOG=""
  if [ -f .openbench_agent.log ]; then
    AGENT_LOG=".openbench_agent.log"
  fi
fi
if [ "$REQUIRE_SEARCH" = "1" ] && [ -n "${AGENT_LOG}" ]; then
  # Grep the file directly — avoid loading multi-MB logs into a bash variable.
  if ! grep -Fq '"tool":"clawql_search"' "$AGENT_LOG"; then
    echo "FAIL: required a clawql_search tool_use in the agent log" >&2
    cap_fail=1
  fi
fi
if [ "$REQUIRE_EXECUTE" = "1" ] && [ -n "${AGENT_LOG}" ]; then
  # Real tool_use rows only — instruction text also mentions clawql_execute.
  exec_hits="$(grep -Fci '"tool":"clawql_execute"' "$AGENT_LOG" || true)"
  if [ "${exec_hits:-0}" -lt 2 ]; then
    echo "FAIL: required ≥2 clawql_execute tool_use calls (got ${exec_hits:-0})" >&2
    cap_fail=1
  fi
  # Prefer explicit dry_run in tool args; also accept dryRun:true (camelCase).
  if ! grep -Eq '"dry_run"[[:space:]]*:[[:space:]]*true|"dryRun"[[:space:]]*:[[:space:]]*true' "$AGENT_LOG"; then
    echo "FAIL: required dry_run:true (or dryRun:true) in execute tool input" >&2
    cap_fail=1
  fi
fi

if [ "$cap_fail" -ne 0 ] || [ "$pass" -ne 1 ]; then
  echo "SCORE: 0.0"
  exit 1
fi

echo "SCORE: 1.0"
exit 0
