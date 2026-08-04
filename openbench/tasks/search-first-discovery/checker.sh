#!/usr/bin/env bash
# Grades search-first-discovery: correct GitHub operationId (+ optional search evidence).
set -euo pipefail

REQUIRE_SEARCH="${OPENBENCH_REQUIRE_SEARCH:-0}"
EXPECTED_OP="security_advisories_list_global_advisories"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"

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
op = str(d.get("operationId") or "").strip()
prov = str(d.get("provider") or "").strip().lower()
ok = op == "${EXPECTED_OP}" and prov in ("github", "gh", "")
if not ok:
    print(f"FAIL: expected operationId=${EXPECTED_OP} provider=github; got op={op!r} provider={prov!r}", flush=True)
raise SystemExit(0 if ok else 1)
PY
then
  pass=1
else
  pass=0
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

if [ "$REQUIRE_SEARCH" = "1" ]; then
  log=""
  if [ -f .openbench_agent.log ]; then
    log="$(cat .openbench_agent.log)"
  fi
  if ! printf '%s' "$log" | grep -Eqi '"name"[[:space:]]*:[[:space:]]*"(clawql_)?search"|tool.*search|clawql_search|\bsearch\b'; then
    # Prefer explicit MCP tool names when present in JSONL.
    if ! printf '%s' "$log" | grep -Eq 'clawql_search|"search"'; then
      echo "FAIL: clawql-on required a search tool call in the agent log" >&2
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
