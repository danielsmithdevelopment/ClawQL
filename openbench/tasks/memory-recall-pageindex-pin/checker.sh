#!/usr/bin/env bash
# Grades memory-recall-pageindex-pin: correct code + memory_recall(sources=pageindex).
set -euo pipefail

REQUIRE_MRPI="${OPENBENCH_REQUIRE_MEMORY_RECALL_PAGEINDEX:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
EXPECTED="cedar-31"

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
code = str(d.get("code") or d.get("CLAWQL_RECALL_PI_CODE") or "").strip()
if code.upper().startswith("CLAWQL_RECALL_PI_CODE="):
    code = code.split("=", 1)[1].strip()
src = str(d.get("source") or "").strip().lower()
# Explicitly fail known vault/decoy
if code in {"maple-99", "fern-42", "orchid-77"}:
    print(f"FAIL: used decoy/wrong-task code {code}", flush=True)
    raise SystemExit(1)
ok = code == "${EXPECTED}" and (
    "memory_recall" in src or "pageindex" in src or "CLAWQL_RECALL_PI_CODE" in d or "code" in d
)
if not ok or code != "${EXPECTED}":
    print(
        f"FAIL: expected code=${EXPECTED} (source~memory_recall preferred); got {d!r}",
        flush=True,
    )
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

if [ "$REQUIRE_MRPI" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for memory_recall pageindex evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log \
      'clawql_pageindex_build_tree|pageindex_build_tree' \
      'clawql_memory_recall|memory_recall'
    then
      echo "FAIL: required real pageindex_build_tree + memory_recall tool_use" >&2
      cap_fail=1
    fi
    # Build must index handbook; memory_recall must pass sources including pageindex;
    # synthesize-only paths do not count.
    if ! python3 - <<'PY'
import json
from pathlib import Path

text = Path(".openbench_agent.log").read_text(encoding="utf-8", errors="replace")
nonempty_build = False
recall_pageindex = False
recall_has_token = False

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
    if tool == "invalid":
        continue
    state = part.get("state") if isinstance(part.get("state"), dict) else {}
    inp = state.get("input") if isinstance(state.get("input"), dict) else {}
    out = str(state.get("output") or "")
    if tool in ("clawql_pageindex_build_tree", "pageindex_build_tree"):
        md = str(inp.get("markdown") or "")
        if "CLAWQL_RECALL_PI_CODE" in md and "cedar-31" in md:
            nonempty_build = True
    if tool in ("clawql_memory_recall", "memory_recall"):
        sources = inp.get("sources")
        src_ok = False
        if isinstance(sources, list):
            src_ok = any(str(s).lower() == "pageindex" for s in sources)
        elif isinstance(sources, str):
            src_ok = "pageindex" in sources.lower()
        if src_ok:
            recall_pageindex = True
        if "cedar-31" in out:
            recall_has_token = True

ok = nonempty_build and recall_pageindex and (recall_has_token or True)
# Prefer token in recall output when present; always require sources=pageindex + build.
ok = nonempty_build and recall_pageindex
if not ok:
    print(
        "FAIL: need pageindex_build_tree with handbook markdown containing "
        "CLAWQL_RECALL_PI_CODE=cedar-31, and memory_recall with sources including pageindex "
        "(pageindex_synthesize alone does not count)",
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
