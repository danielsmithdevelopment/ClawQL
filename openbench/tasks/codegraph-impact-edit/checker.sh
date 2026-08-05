#!/usr/bin/env bash
# Grades codegraph-impact-edit: full rename impact set + codegraph tool evidence.
set -euo pipefail

REQUIRE_CG="${OPENBENCH_REQUIRE_CODEGRAPH:-0}"
HARD_MAX_TURNS="${OPENBENCH_HARD_MAX_TURNS:-50}"
HARD_MAX_TOKENS="${OPENBENCH_HARD_MAX_TOKENS:-12000}"

REQUIRED_REL=(
  "core/pricing.py"
  "api/checkout.py"
  "api/invoice.py"
  "workers/batch.py"
  "reports/summary.py"
  "cli/main.py"
  "tests/test_pricing.py"
)

cap_fail=0
pass=0

if [ ! -f impact.json ] && [ -f repo/impact.json ]; then
  # Cheap models often write the artifact under repo/; normalize to workspace root.
  cp repo/impact.json impact.json
fi

if [ ! -f impact.json ]; then
  echo "FAIL: impact.json missing (expected at workspace root or repo/impact.json)" >&2
  echo "SCORE: 0.0"
  exit 1
fi

if python3 - <<'PY'
import json
import re
import subprocess
import sys
from pathlib import Path

required = [
    "core/pricing.py",
    "api/checkout.py",
    "api/invoice.py",
    "workers/batch.py",
    "reports/summary.py",
    "cli/main.py",
    "tests/test_pricing.py",
]

try:
    d = json.loads(Path("impact.json").read_text(encoding="utf-8"))
except Exception as exc:
    print(f"FAIL: impact.json parse error: {exc}", flush=True)
    raise SystemExit(1)

old = str(d.get("old_name") or "").strip()
new = str(d.get("new_name") or "").strip()
src = str(d.get("source") or "").strip().lower()
files = d.get("files")
if not isinstance(files, list):
    print(f"FAIL: impact.json files must be a list; got {d!r}", flush=True)
    raise SystemExit(1)

norm = []
for f in files:
    p = str(f).replace("\\", "/").lstrip("./")
    if p.startswith("repo/"):
        p = p[len("repo/") :]
    norm.append(p)

missing_listed = [r for r in required if not any(r == n or n.endswith("/" + r) or n.endswith(r) for n in norm)]
if missing_listed:
    print(f"FAIL: impact.json missing required files: {missing_listed}", flush=True)
    raise SystemExit(1)

if old != "compute_total" or new != "compute_grand_total" or "codegraph" not in src:
    print(
        f"FAIL: expected old=compute_total new=compute_grand_total source~codegraph; got {d!r}",
        flush=True,
    )
    raise SystemExit(1)

repo = Path("repo")
if not repo.is_dir():
    print("FAIL: repo/ missing", flush=True)
    raise SystemExit(1)

old_pat = re.compile(r"\bcompute_total\b")
new_pat = re.compile(r"\bcompute_grand_total\b")

leftovers = []
for path in repo.rglob("*.py"):
    text = path.read_text(encoding="utf-8")
    if old_pat.search(text):
        leftovers.append(str(path).replace("\\", "/"))

if leftovers:
    print(f"FAIL: compute_total still present in: {leftovers}", flush=True)
    raise SystemExit(1)

missing_new = []
for rel in required:
    path = repo / rel
    if not path.is_file():
        missing_new.append(rel + " (missing file)")
        continue
    text = path.read_text(encoding="utf-8")
    if not new_pat.search(text):
        missing_new.append(rel)

if missing_new:
    print(f"FAIL: compute_grand_total missing in: {missing_new}", flush=True)
    raise SystemExit(1)

proc = subprocess.run(
    [sys.executable, "-m", "compileall", "-q", "repo"],
    capture_output=True,
    text=True,
)
if proc.returncode != 0:
    print(f"FAIL: compileall failed: {proc.stdout}{proc.stderr}", flush=True)
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

if [ "$REQUIRE_CG" = "1" ]; then
  if [ ! -f .openbench_agent.log ]; then
    echo "FAIL: missing .openbench_agent.log for codegraph evidence" >&2
    cap_fail=1
  else
    helper="${TASK_DIR}/../../scripts/require-real-clawql-tools.py"
    if [ ! -f "$helper" ]; then
      helper="$(cd "$(dirname "$0")/../.." && pwd)/scripts/require-real-clawql-tools.py"
    fi
    if ! python3 "$helper" .openbench_agent.log \
      'clawql_codegraph_index|codegraph_index' \
      'clawql_codegraph_query|codegraph_query|clawql_codegraph_explain|codegraph_explain|clawql_codegraph_neighbors|codegraph_neighbors|clawql_codegraph_path|codegraph_path'
    then
      echo "FAIL: required real codegraph index + query/explain/neighbors/path tool_use" >&2
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
