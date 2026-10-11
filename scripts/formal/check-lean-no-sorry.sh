#!/usr/bin/env bash
# Fail if any Lean sources contain unfinished proofs (sorry / admit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/lean"
if [[ ! -d "$DIR" ]]; then
  echo "No formal/lean directory" >&2
  exit 1
fi
# Match Lean tactics only — not hyphenated filenames in doc comments
# (e.g. check-lean-no-sorry.sh). Strip block (/- ... -/) and line (--) comments.
python3 - <<'PY' "$DIR"
import re, sys
from pathlib import Path

root = Path(sys.argv[1])
pat = re.compile(r"(^|[^A-Za-z0-9_-])(sorry|admit)([^A-Za-z0-9_]|$)")
failed = False
for path in sorted(root.rglob("*.lean")):
    text = path.read_text(encoding="utf-8")
    stripped = re.sub(r"/-.*?-/", "", text, flags=re.S)
    for i, line in enumerate(stripped.splitlines(), 1):
        code = line.split("--", 1)[0]
        if pat.search(code):
            print(f"{path}:{i}:{line}")
            failed = True
if failed:
    print("FAIL: unfinished Lean proofs (sorry/admit) under formal/lean/", file=sys.stderr)
    sys.exit(1)
print("OK: no sorry/admit in formal/lean/")
PY
