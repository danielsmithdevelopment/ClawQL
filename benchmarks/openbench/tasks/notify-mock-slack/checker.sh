#!/usr/bin/env bash
# Grades notify-mock-slack: notify tool evidence + marker artifact.
set -euo pipefail

REQUIRE_NOTIFY="${OPENBENCH_REQUIRE_NOTIFY:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
EXPECTED_MARKER="nebula-55"
EXPECTED_CHANNEL="C-OPENBENCH"

cap_fail=0
pass=0

if [ ! -f notify.json ]; then
  echo "FAIL: notify.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<PY
import json
from pathlib import Path
try:
    d = json.loads(Path("notify.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: notify.json parse error: {exc}", flush=True)
    raise SystemExit(1)
ok = d.get("ok") is True or str(d.get("ok")).lower() in ("true", "1")
ch = str(d.get("channel") or "").strip()
marker = str(d.get("marker") or "").strip()
src = str(d.get("source") or "").strip().lower()
text_blob = json.dumps(d)
ok_marker = marker == "${EXPECTED_MARKER}" or "${EXPECTED_MARKER}" in text_blob
ok_ch = ch == "${EXPECTED_CHANNEL}" or "${EXPECTED_CHANNEL}" in ch
ok_all = ok and ok_ch and ok_marker and "notify" in src
if not ok_all:
    print(f"FAIL: expected ok=true channel=${EXPECTED_CHANNEL} marker=${EXPECTED_MARKER} source~notify; got {d!r}", flush=True)
raise SystemExit(0 if ok_all else 1)
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

if [ "$REQUIRE_NOTIFY" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for notify evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log 'clawql_notify|notify'; then
      echo "FAIL: required real notify/clawql_notify tool_use" >&2
      cap_fail=1
    fi
    # Marker must appear in a real notify tool input (not only answer invent).
    if ! python3 - <<'PY'
import json
from pathlib import Path
found = False
for line in Path(".openbench_agent.log").read_text(encoding="utf-8", errors="replace").splitlines():
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        obj = json.loads(line)
    except Exception:
        continue
    part = obj.get("part") if isinstance(obj, dict) else None
    if not isinstance(part, dict):
        continue
    tool = part.get("tool")
    if tool not in ("clawql_notify", "notify"):
        continue
    state = part.get("state") if isinstance(part.get("state"), dict) else {}
    inp = state.get("input") if isinstance(state.get("input"), dict) else {}
    blob = json.dumps(inp)
    if "nebula-55" in blob or "CLAWQL_NOTIFY_MARKER=nebula-55" in blob:
        found = True
        break
raise SystemExit(0 if found else 1)
PY
    then
      echo "FAIL: notify tool input must include CLAWQL_NOTIFY_MARKER=nebula-55 / nebula-55" >&2
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
