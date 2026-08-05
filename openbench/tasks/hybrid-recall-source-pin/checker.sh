#!/usr/bin/env bash
# Grades hybrid-recall-source-pin: correct code + PageIndex evidence (vault decoy fails).
set -euo pipefail

REQUIRE_PI="${OPENBENCH_REQUIRE_PAGEINDEX:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
EXPECTED="fern-42"

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
# Accept common agent shapes: {"code":…} or {"CLAWQL_HYBRID_CODE":…}
code = str(d.get("code") or d.get("CLAWQL_HYBRID_CODE") or "").strip()
if code.upper().startswith("CLAWQL_HYBRID_CODE="):
    code = code.split("=", 1)[1].strip()
src = str(d.get("source") or "").strip().lower()
# Explicitly fail known vault decoy
if code == "rose-99":
    print("FAIL: used vault/decoy code rose-99", flush=True)
    raise SystemExit(1)
# source may be omitted when the agent used the CLAWQL_HYBRID_CODE key;
# real pageindex tool_use is still required below when REQUIRE_PI=1.
ok = code == "${EXPECTED}" and ("pageindex" in src or "CLAWQL_HYBRID_CODE" in d or "code" in d)
if not ok or code != "${EXPECTED}":
    print(f"FAIL: expected code=${EXPECTED} (source~pageindex preferred); got {d!r}", flush=True)
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

if [ "$REQUIRE_PI" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for pageindex evidence" >&2
    cap_fail=1
  else
    # Reject OpenCode "invalid" tool rows that embed the name in input.tool
    # (clawql-off false positive on 30886497135).
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log \
      'clawql_pageindex_build_tree|pageindex_build_tree' \
      'clawql_pageindex_synthesize|pageindex_synthesize|clawql_pageindex_traverse|pageindex_traverse'
    then
      echo "FAIL: required real pageindex build_tree + synthesize/traverse tool_use" >&2
      cap_fail=1
    fi
    # Empty markdown:"" builds do not count — PageIndex must index the handbook.
    if ! python3 - <<'PY'
import json
from pathlib import Path
text = Path(".openbench_agent.log").read_text(encoding="utf-8", errors="replace")
nonempty_build = False
synth_has_token = False
for line in text.splitlines():
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
    state = part.get("state") if isinstance(part.get("state"), dict) else {}
    inp = state.get("input") if isinstance(state.get("input"), dict) else {}
    out = str(state.get("output") or "")
    if tool in ("clawql_pageindex_build_tree", "pageindex_build_tree"):
        md = str(inp.get("markdown") or "")
        if "CLAWQL_HYBRID_CODE" in md and "fern-42" in md:
            nonempty_build = True
    if tool in (
        "clawql_pageindex_synthesize",
        "pageindex_synthesize",
        "clawql_pageindex_traverse",
        "pageindex_traverse",
    ):
        if "fern-42" in out:
            synth_has_token = True
ok = nonempty_build or synth_has_token
if not ok:
    print(
        "FAIL: pageindex build must include handbook markdown with CLAWQL_HYBRID_CODE=fern-42 "
        "(empty markdown:\"\" builds do not count), or synthesize/traverse output must contain fern-42",
        flush=True,
    )
raise SystemExit(0 if ok else 1)
PY
    then
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
