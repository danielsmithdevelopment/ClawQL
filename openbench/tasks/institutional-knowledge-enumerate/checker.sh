#!/usr/bin/env bash
# Grades institutional-knowledge-enumerate:
# - Partial credit = |hits ∩ expected| / |expected|
# - Emits MATTERS_FOUND: k/5 (headline diagnostic) + SCORE
# - Any false positive (near-miss or unknown id) → 0.0 / 0/5
# - When OPENBENCH_REQUIRE_INSTITUTIONAL=1, require real memory_recall tool_use
#   (off arm cannot score by guessing the fixture set).
set -euo pipefail

REQUIRE_INSTITUTIONAL="${OPENBENCH_REQUIRE_INSTITUTIONAL:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-30}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-8000}"
TASK_DIR="$(cd "$(dirname "$0")" && pwd)"

cap_fail=0
EXPECTED_N=5

emit_zero() {
  echo "MATTERS_FOUND: 0/${EXPECTED_N}"
  echo "SCORE: 0.0"
  exit 1
}

if [ ! -f matters.json ]; then
  echo "FAIL: matters.json missing" >&2
  emit_zero
fi

# stdout lines: MATTERS_FOUND:k/n  then SCORE:x  (plus optional MATTERS_IDS)
eval_out="$(
  python3 - <<'PY'
import json
import sys
from pathlib import Path

expected = {"MAT-2388", "MAT-2401", "MAT-2415", "MAT-2450", "MAT-2462"}
# All other seeded matter IDs (12→30 fixture). Including any → 0/5.
near_miss = {
    "MAT-2390",
    "MAT-2405",
    "MAT-2410",
    "MAT-2420",
    "MAT-2433",
    "MAT-2444",
    "MAT-2470",
    "MAT-2501",
    "MAT-2502",
    "MAT-2503",
    "MAT-2504",
    "MAT-2505",
    "MAT-2506",
    "MAT-2507",
    "MAT-2508",
    "MAT-2509",
    "MAT-2510",
    "MAT-2511",
    "MAT-2512",
    "MAT-2513",
    "MAT-2514",
    "MAT-2515",
    "MAT-2516",
    "MAT-2517",
    "MAT-2518",
}
n_exp = len(expected)

def emit(found: int, score: float, ids=None, err=None) -> None:
    if err:
        print(err, file=sys.stderr, flush=True)
    print(f"MATTERS_FOUND:{found}/{n_exp}")
    if ids is not None:
        print("MATTERS_IDS:" + ",".join(ids))
    print(f"SCORE:{score:.4f}")

try:
    d = json.loads(Path("matters.json").read_text(encoding="utf-8"))
except Exception as exc:
    emit(0, 0.0, err=f"FAIL: matters.json parse error: {exc}")
    raise SystemExit(0)

raw = d.get("matters")
if not isinstance(raw, list):
    emit(0, 0.0, err=f"FAIL: matters must be a list; got {d!r}")
    raise SystemExit(0)

ids = set()
for item in raw:
    if isinstance(item, str):
        mid = item.strip().upper()
        if mid:
            ids.add(mid)
    elif isinstance(item, dict):
        mid = item.get("id") or item.get("matter_id") or item.get("matter")
        if mid:
            ids.add(str(mid).strip().upper())

false_pos = ids - expected
if false_pos & near_miss:
    emit(
        0,
        0.0,
        err=f"FAIL: near-miss matter(s) included: {sorted(false_pos & near_miss)}",
    )
    raise SystemExit(0)
if false_pos:
    emit(0, 0.0, err=f"FAIL: unknown/extra matter id(s): {sorted(false_pos)}")
    raise SystemExit(0)

hits = sorted(ids & expected)
partial = len(hits) / float(n_exp)
src = str(d.get("source") or "").strip().lower()
# On-arm uses memory_recall; off-arm may cite workspace note reads after exhaustive search.
ok_src = (
    "memory" in src
    or "recall" in src
    or "workspace" in src
    or "note" in src
    or "seed" in src
)
if not ok_src:
    emit(
        0,
        0.0,
        err=f"FAIL: source must reference memory_recall or workspace notes; got {src!r}",
    )
    raise SystemExit(0)

emit(len(hits), partial, ids=hits)
PY
)"

matters_found_line="$(printf '%s\n' "$eval_out" | grep -E '^MATTERS_FOUND:' | tail -1 || true)"
matters_ids_line="$(printf '%s\n' "$eval_out" | grep -E '^MATTERS_IDS:' | tail -1 || true)"
score_line="$(printf '%s\n' "$eval_out" | grep -E '^SCORE:' | tail -1 || true)"
score="${score_line#SCORE:}"
score="${score:-0.0}"
found_raw="${matters_found_line#MATTERS_FOUND:}"
found_raw="${found_raw:-0/${EXPECTED_N}}"

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
    echo "FAIL: missing .openbench_agent.log for institutional evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log 'clawql_memory_recall|memory_recall'; then
      echo "FAIL: required real memory_recall tool_use (guessing fixture IDs without tools scores 0)" >&2
      cap_fail=1
    fi
  fi
fi

if [ "$cap_fail" -ne 0 ]; then
  echo "MATTERS_FOUND: 0/${EXPECTED_N}"
  echo "SCORE: 0.0"
  exit 1
fi

echo "MATTERS_FOUND: ${found_raw}"
if [ -n "${matters_ids_line:-}" ]; then
  echo "${matters_ids_line}"
fi
score_fmt="$(python3 -c "print(f'{float(\"$score\"):g}')")"
echo "SCORE: $score_fmt"
python3 -c "import sys; sys.exit(0 if float('$score') >= 1.0 - 1e-9 else 1)"
