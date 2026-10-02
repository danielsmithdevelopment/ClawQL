#!/usr/bin/env bash
# Grades composed-safe-rollout: multi-tool sequence evidence + artifact.
set -euo pipefail

REQUIRE_COMP="${OPENBENCH_REQUIRE_COMPOSED:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-40}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-10000}"

cap_fail=0
pass=0

if [ ! -f rollout.json ]; then
  echo "FAIL: rollout.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<PY
import json
from pathlib import Path
try:
    d = json.loads(Path("rollout.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: rollout.json parse error: {exc}", flush=True)
    raise SystemExit(1)
dry = d.get("dryRunOnly")
ok_dry = dry is True or str(dry).lower() in ("true", "1", "yes")
src = str(d.get("source") or "").strip().lower()
composed = d.get("composed")
ok_comp = composed is True or str(composed).lower() in ("true", "1", "yes") or "composed" in src
ok = ok_dry and ok_comp
if not ok:
    print(f"FAIL: expected dryRunOnly=true composed/source~composed; got {d!r}", flush=True)
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

if [ "$REQUIRE_COMP" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for composed evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log \
      'clawql_search|search' \
      'clawql_execute|execute' \
      'clawql_audit|audit' \
      'clawql_memory_ingest|memory_ingest'
    then
      echo "FAIL: required real search + execute + audit + memory_ingest tool_use" >&2
      cap_fail=1
    fi
    # ≥2 dry_run execute
    if ! python3 - <<'PY'
import json
from pathlib import Path
n = 0
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
    if part.get("tool") not in ("clawql_execute", "execute"):
        continue
    state = part.get("state") if isinstance(part.get("state"), dict) else {}
    inp = state.get("input") if isinstance(state.get("input"), dict) else {}
    # dry_run may be top-level or nested in args
    dry = inp.get("dry_run")
    if dry is None and isinstance(inp.get("args"), dict):
        dry = inp["args"].get("dry_run")
    if dry is True or str(dry).lower() in ("true", "1", "yes"):
        n += 1
raise SystemExit(0 if n >= 2 else 1)
PY
    then
      echo "FAIL: required ≥2 execute tool_use with dry_run=true" >&2
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
