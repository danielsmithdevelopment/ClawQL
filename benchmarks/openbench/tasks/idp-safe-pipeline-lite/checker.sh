#!/usr/bin/env bash
# Grades idp-safe-pipeline-lite: 7 stubbed IDP stages + pipeline.json.
set -euo pipefail

REQUIRE_IDP="${OPENBENCH_REQUIRE_IDP:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-50}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-12000}"

cap_fail=0
pass=0
stages_passed=0

if [ ! -f pipeline.json ]; then
  echo "FAIL: pipeline.json missing" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<'PY'
import json
from pathlib import Path

EXPECTED_STAGES = [
    "discover",
    "plan_extract",
    "plan_redact",
    "audit_trail",
    "onyx_cite",
    "notify_handoff",
    "persist",
]
try:
    d = json.loads(Path("pipeline.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: pipeline.json parse error: {exc}", flush=True)
    raise SystemExit(1)

corr = str(d.get("correlation_id") or d.get("correlationId") or "").strip()
deal = str(d.get("deal_id") or d.get("dealId") or "").strip()
dry = d.get("dryRunOnly")
ok_dry = dry is True or str(dry).lower() in ("true", "1", "yes")
onyx = str(d.get("onyx_code") or d.get("code") or "").strip()
notify = str(d.get("notify_marker") or d.get("marker") or "").strip()
src = str(d.get("source") or "").strip().lower()
stages = d.get("stages") if isinstance(d.get("stages"), list) else []
stages_norm = [str(s).strip() for s in stages]
sp = d.get("stages_passed")
try:
    sp_n = int(sp) if sp is not None else len(stages_norm)
except Exception:
    sp_n = len(stages_norm)

ok_stages = stages_norm == EXPECTED_STAGES or (
    set(stages_norm) >= set(EXPECTED_STAGES) and sp_n >= 7
)
ok_src = "idp" in src or "pipeline" in src
ok = (
    corr == "idp-lite-openbench-01"
    and deal == "deal-idp-lite-01"
    and ok_dry
    and onyx == "quartz-21"
    and notify == "nebula-55"
    and ok_stages
    and ok_src
    and sp_n >= 7
)
if not ok:
    print(f"FAIL: expected IDP pipeline artifact; got {d!r}", flush=True)
raise SystemExit(0 if ok else 1)
PY
then
  pass=1
  stages_passed=7
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

if [ "$REQUIRE_IDP" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for IDP pipeline evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    tool_score=0
    if python3 "$helper" .openbench_agent.log 'clawql_search|search'; then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: missing real search tool_use" >&2
      cap_fail=1
    fi
    if python3 "$helper" .openbench_agent.log 'clawql_execute|execute'; then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: missing real execute tool_use" >&2
      cap_fail=1
    fi
    if python3 - <<'PY'
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
    dry = inp.get("dry_run")
    if dry is None and isinstance(inp.get("args"), dict):
        dry = inp["args"].get("dry_run")
    if dry is True or str(dry).lower() in ("true", "1", "yes"):
        n += 1
raise SystemExit(0 if n >= 2 else 1)
PY
    then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: required ≥2 execute tool_use with dry_run=true" >&2
      cap_fail=1
    fi
    if python3 "$helper" .openbench_agent.log 'clawql_audit|audit'; then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: missing real audit tool_use" >&2
      cap_fail=1
    fi
    if python3 "$helper" .openbench_agent.log \
      'clawql_knowledge_search_onyx|knowledge_search_onyx'
    then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: missing real knowledge_search_onyx tool_use" >&2
      cap_fail=1
    fi
    if python3 "$helper" .openbench_agent.log 'clawql_notify|notify'; then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: missing real notify tool_use" >&2
      cap_fail=1
    fi
    if python3 "$helper" .openbench_agent.log 'clawql_memory_ingest|memory_ingest'; then
      tool_score=$((tool_score + 1))
    else
      echo "FAIL: missing real memory_ingest tool_use" >&2
      cap_fail=1
    fi
    if [ "$pass" != "1" ] || [ "$cap_fail" -ne 0 ]; then
      stages_passed="$tool_score"
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ] || [ "$pass" -ne 1 ]; then
  python3 - <<PY
sp = int("${stages_passed:-0}")
print(f"SCORE: {min(sp, 7) / 7.0:.4f}")
PY
  exit 1
fi

echo "SCORE: 1.0"
exit 0
