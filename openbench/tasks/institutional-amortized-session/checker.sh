#!/usr/bin/env bash
# Grades institutional-amortized-session (B-7.3):
# - Mean of 5 per-step scores from session/qN.json
# - Emits SESSION_STEPS: k/5 + SCORE
# - When OPENBENCH_REQUIRE_INSTITUTIONAL=1, require real memory_recall in session log
set -euo pipefail

REQUIRE_INSTITUTIONAL="${OPENBENCH_REQUIRE_INSTITUTIONAL:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-90}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-22000}"
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"

cap_fail=0
EXPECTED_STEPS=5

emit_zero() {
  echo "SESSION_STEPS: 0/${EXPECTED_STEPS}"
  echo "SCORE: 0.0"
  exit 1
}

eval_out="$(
  TASK_DIR="$TASK_DIR" python3 - <<'PY'
import json
import os
import sys
from pathlib import Path

task_dir = Path(os.environ["TASK_DIR"])
gt = json.loads((task_dir / "ground_truth.json").read_text(encoding="utf-8"))
steps = gt.get("steps") or {}

def norm_id(x: str) -> str:
    return " ".join(str(x or "").strip().upper().split())

def norm_client(x: str) -> str:
    return " ".join(str(x or "").strip().split())

def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, str(exc)

def matter_set_score(path: Path, expected: set[str]) -> tuple[float, str]:
    if not path.is_file():
        return 0.0, f"missing {path.name}"
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return 0.0, f"parse {path.name}: {exc}"
    if isinstance(parsed, list):
        raw = parsed
    elif isinstance(parsed, dict):
        raw = parsed.get("matters")
    else:
        return 0.0, f"bad shape {path.name}"
    if not isinstance(raw, list) or not raw:
        return 0.0, f"empty matters {path.name}"
    ids = set()
    for item in raw:
        if isinstance(item, str) and item.strip():
            ids.add(norm_id(item))
        elif isinstance(item, dict):
            mid = item.get("id") or item.get("matter_id") or item.get("matter")
            if mid:
                ids.add(norm_id(str(mid)))
    if not ids:
        return 0.0, f"no ids {path.name}"
    if ids - expected:
        return 0.0, f"FP in {path.name}: {sorted(ids - expected)}"
    if ids != expected:
        return 0.0, f"incomplete {path.name}: got {sorted(ids)} want {sorted(expected)}"
    return 1.0, "ok"

scores = []
notes = []
order = ["q1", "q2", "q3", "q4", "q5"]
for sid in order:
    spec = steps.get(sid) or {}
    art = Path(str(spec.get("artifact") or f"session/{sid}.json"))
    kind = str(spec.get("kind") or "")
    if kind == "matter_set":
        expected = {norm_id(x) for x in (spec.get("expected_matters") or []) if str(x).strip()}
        sc, note = matter_set_score(art, expected)
    elif kind == "count":
        if not art.is_file():
            sc, note = 0.0, f"missing {art.name}"
        else:
            try:
                parsed = json.loads(art.read_text(encoding="utf-8"))
            except Exception as exc:
                sc, note = 0.0, f"parse {art.name}: {exc}"
            else:
                if isinstance(parsed, dict):
                    count = parsed.get("count")
                else:
                    count = parsed
                try:
                    ok = int(count) == int(spec.get("expected_count"))
                except (TypeError, ValueError):
                    ok = False
                sc, note = (1.0, "ok") if ok else (0.0, f"count {count!r} != {spec.get('expected_count')}")
    elif kind == "client_set":
        expected = {norm_client(x) for x in (spec.get("expected_clients") or []) if str(x).strip()}
        if not art.is_file():
            sc, note = 0.0, f"missing {art.name}"
        else:
            try:
                parsed = json.loads(art.read_text(encoding="utf-8"))
            except Exception as exc:
                sc, note = 0.0, f"parse {art.name}: {exc}"
            else:
                raw = parsed.get("clients") if isinstance(parsed, dict) else parsed
                if not isinstance(raw, list):
                    sc, note = 0.0, f"bad clients {art.name}"
                else:
                    got = {norm_client(x) for x in raw if str(x).strip()}
                    # Case-insensitive compare
                    exp_l = {c.lower() for c in expected}
                    got_l = {c.lower() for c in got}
                    if got_l - exp_l:
                        sc, note = 0.0, f"FP clients: {sorted(got_l - exp_l)}"
                    elif got_l != exp_l:
                        sc, note = 0.0, f"incomplete clients: {sorted(got)}"
                    else:
                        sc, note = 1.0, "ok"
    elif kind == "matter_id":
        expected = norm_id(str(spec.get("expected_matter") or ""))
        if not art.is_file():
            sc, note = 0.0, f"missing {art.name}"
        else:
            try:
                parsed = json.loads(art.read_text(encoding="utf-8"))
            except Exception as exc:
                sc, note = 0.0, f"parse {art.name}: {exc}"
            else:
                if isinstance(parsed, dict):
                    mid = parsed.get("matter") or parsed.get("matter_id") or parsed.get("top1")
                else:
                    mid = parsed
                got = norm_id(str(mid or ""))
                sc, note = (1.0, "ok") if got == expected else (0.0, f"matter {got!r} != {expected!r}")
    else:
        sc, note = 0.0, f"unknown kind {kind}"
    scores.append(sc)
    notes.append(f"{sid}:{note}")

passed = sum(1 for s in scores if s >= 1.0 - 1e-9)
mean = sum(scores) / float(len(scores) or 1)
print(f"SESSION_STEPS:{passed}/{len(order)}", flush=True)
print(f"STEP_NOTES:{';'.join(notes)}", flush=True)
print(f"SCORE:{mean:.4f}", flush=True)
for line in notes:
    if not line.endswith(":ok"):
        print(f"FAIL detail: {line}", file=sys.stderr, flush=True)
PY
)"

steps_line="$(printf '%s\n' "$eval_out" | grep -E '^SESSION_STEPS:' | tail -1 || true)"
score_line="$(printf '%s\n' "$eval_out" | grep -E '^SCORE:' | tail -1 || true)"
score="${score_line#SCORE:}"
score="${score:-0.0}"
steps_raw="${steps_line#SESSION_STEPS:}"
steps_raw="${steps_raw:-0/${EXPECTED_STEPS}}"

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

if [ "$REQUIRE_INSTITUTIONAL" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for session memory evidence" >&2
    cap_fail=1
  else
    scripts_dir="${TASK_DIR}/../../scripts"
    if [ ! -d "$scripts_dir" ]; then
      scripts_dir="$(cd "$(dirname "$0")/../.." && pwd)/scripts"
    fi
    if ! python3 "$scripts_dir/require-real-clawql-tools.py" .openbench_agent.log \
      'clawql_memory_recall|memory_recall'; then
      echo "FAIL: required real memory_recall tool_use in session" >&2
      cap_fail=1
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ]; then
  echo "SESSION_STEPS: 0/${EXPECTED_STEPS}"
  echo "SCORE: 0.0"
  exit 1
fi

echo "SESSION_STEPS: ${steps_raw}"
score_fmt="$(python3 -c "print(f'{float(\"$score\"):g}')")"
echo "SCORE: $score_fmt"
# Pass offline validate when all steps are perfect (solution overlay).
python3 -c "import sys; sys.exit(0 if float('$score') >= 1.0 - 1e-9 else 1)"
