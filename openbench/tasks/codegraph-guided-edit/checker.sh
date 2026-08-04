#!/usr/bin/env bash
# Grades codegraph-guided-edit: marker + file path + codegraph tool evidence.
set -euo pipefail

REQUIRE_CG="${OPENBENCH_REQUIRE_CODEGRAPH:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-35}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
EXPECTED_MARKER="cg-alpha-9"

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
marker = str(d.get("marker") or "").strip()
path = str(d.get("file") or d.get("path") or "").replace("\\\\", "/")
src = str(d.get("source") or "").strip().lower()
ok_path = "payments/ledger.py" in path or path.endswith("ledger.py")
ok = marker == "${EXPECTED_MARKER}" and ok_path and "codegraph" in src
if not ok:
    print(f"FAIL: expected marker=${EXPECTED_MARKER} file~payments/ledger.py source~codegraph; got {d!r}", flush=True)
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

if [ "$REQUIRE_CG" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for codegraph evidence" >&2
    cap_fail=1
  else
    if ! grep -Eq '"tool":"clawql_codegraph_index"|"tool":"codegraph_index"' .openbench_agent.log; then
      echo "FAIL: required codegraph_index tool_use" >&2
      cap_fail=1
    fi
    if ! grep -Eq '"tool":"clawql_codegraph_query"|"tool":"codegraph_query"|"tool":"clawql_codegraph_explain"|"tool":"codegraph_explain"|"tool":"clawql_codegraph_neighbors"|"tool":"codegraph_neighbors"' .openbench_agent.log; then
      echo "FAIL: required codegraph_query/explain/neighbors tool_use" >&2
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
