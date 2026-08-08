#!/usr/bin/env bash
# Grades institutional-client-preference (B-7.2):
# - Top-1 exact match against ground_truth.json (invented IDs → 0)
# - Empty source is soft (no longer zeros a correct top1); invalid source → 0
# - When OPENBENCH_REQUIRE_PREFERENCE=1, require real memory_recall tool_use
set -euo pipefail

REQUIRE_PREFERENCE="${OPENBENCH_REQUIRE_PREFERENCE:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-45}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-14000}"
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"

cap_fail=0

emit_zero() {
  echo "TOP1: wrong"
  echo "SCORE: 0.0"
  exit 1
}

if [ ! -f preference.json ]; then
  echo "FAIL: preference.json missing" >&2
  emit_zero
fi

eval_out="$(
  TASK_DIR="$TASK_DIR" python3 - <<'PY'
import json
import os
import sys
from pathlib import Path

task_dir = Path(os.environ["TASK_DIR"])
manifest = json.loads((task_dir / "ground_truth.json").read_text(encoding="utf-8"))
expected = str(manifest.get("top1") or "").strip().upper()
aliases = {
    str(a).strip().upper()
    for a in (manifest.get("top1_aliases") or [])
    if str(a).strip()
}
aliases.add(expected)

def normalize(raw: str) -> str:
    import re

    s = " ".join(str(raw or "").strip().upper().split())
    # Agents sometimes paste "MAT-2801-A (ANNEX TO MAT-2801)" — keep the ID.
    m = re.search(r"\b(MAT-\d+-[A-Z])\b", s)
    if m:
        return m.group(1)
    # Accept "TERM SHEET A" / "OPTION A" / bare "A" as aliases when listed.
    return s

def emit(ok: bool, top1: str, err: str | None = None) -> None:
    if err:
        print(err, file=sys.stderr, flush=True)
    print(f"TOP1:{top1 or 'missing'}")
    print(f"SCORE:{(1.0 if ok else 0.0):.4f}")

try:
    parsed = json.loads(Path("preference.json").read_text(encoding="utf-8"))
except Exception as exc:
    emit(False, "", err=f"FAIL: preference.json parse error: {exc}")
    raise SystemExit(0)

if not isinstance(parsed, dict):
    emit(False, "", err="FAIL: preference.json must be an object")
    raise SystemExit(0)

top1 = normalize(str(parsed.get("top1") or ""))
source = str(parsed.get("source") or "").strip().lower()
# Source is soft: empty source no longer zeros a correct top1 (DeepSeek often
# omits it). When present, it must look like a real provenance string.
if source:
    ok_src = (
        "memory" in source
        or "recall" in source
        or "workspace" in source
        or "filesystem" in source
        or "file" in source
        or "note" in source
        or "seed" in source
    )
    if not ok_src:
        emit(False, top1, err=f"FAIL: invalid source {source!r}")
        raise SystemExit(0)
if not top1:
    emit(False, "", err="FAIL: missing top1")
    raise SystemExit(0)
# Reject obvious prompt-placeholder / invented IDs.
ranking = {
    str(x).strip().upper()
    for x in (manifest.get("ranking") or [])
    if str(x).strip()
}
if "XXXX" in top1 or top1.endswith("-Y") or top1 in {"MAT-XXXX-Y", "MAT-XXXX"}:
    emit(False, top1, err=f"FAIL: placeholder top1 {top1!r} (copy Option identifier from annex)")
    raise SystemExit(0)
# If ranking is known, reject IDs that are not one of the three annex options
# (unless they match an allowed alias like TERM SHEET A).
if ranking and top1 not in aliases and top1 not in ranking:
    emit(
        False,
        top1,
        err=f"FAIL: top1 {top1!r} is not a valid annex Option identifier {sorted(ranking)}",
    )
    raise SystemExit(0)

ok = top1 in aliases
if not ok:
    emit(False, top1, err=f"FAIL: top1 {top1} != expected {expected} (aliases={sorted(aliases)})")
else:
    emit(True, top1)
PY
)"

top1_line="$(printf '%s\n' "$eval_out" | grep -E '^TOP1:' | tail -1 || true)"
score_line="$(printf '%s\n' "$eval_out" | grep -E '^SCORE:' | tail -1 || true)"
score="${score_line#SCORE:}"
score="${score:-0.0}"
top1_raw="${top1_line#TOP1:}"
top1_raw="${top1_raw:-wrong}"

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

if [ "$REQUIRE_PREFERENCE" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for preference evidence" >&2
    cap_fail=1
  else
    scripts_dir="${TASK_DIR}/../../scripts"
    if [ ! -d "$scripts_dir" ]; then
      scripts_dir="$(cd "$(dirname "$0")/../.." && pwd)/scripts"
    fi
    if ! python3 "$scripts_dir/require-real-clawql-tools.py" .openbench_agent.log \
      'clawql_memory_recall|memory_recall'; then
      echo "FAIL: required real memory_recall tool_use" >&2
      cap_fail=1
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ]; then
  echo "TOP1: wrong"
  echo "SCORE: 0.0"
  exit 1
fi

echo "TOP1: ${top1_raw}"
score_fmt="$(python3 -c "print(f'{float(\"$score\"):g}')")"
echo "SCORE: $score_fmt"
python3 -c "import sys; sys.exit(0 if float('$score') >= 1.0 - 1e-9 else 1)"
