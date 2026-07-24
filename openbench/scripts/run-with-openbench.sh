#!/usr/bin/env bash
# Helper: run ClawQL OpenBench tasks via an OpenBench checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OPENBENCH_ROOT="${OPENBENCH_ROOT:-}"
HARNESS="${CLAWQL_OPENBENCH_HARNESS:-claude}"
MODEL="${OPENBENCH_MODEL:-claude-opus-4-8}"
TASK="${1:-memory-dependent-continuation}"
TRIALS="${TRIALS:-1}"

if [ -z "$OPENBENCH_ROOT" ]; then
  echo "Set OPENBENCH_ROOT to a clone of https://github.com/minghinmatthewlam/openbench" >&2
  exit 2
fi

mkdir -p "$OPENBENCH_ROOT/obench/adapters"
cp "$ROOT/openbench/adapters/clawql.py" "$OPENBENCH_ROOT/obench/adapters/clawql.py"

TASK_SRC="$ROOT/openbench/tasks/$TASK"
if [ ! -d "$TASK_SRC" ]; then
  echo "Unknown ClawQL task: $TASK" >&2
  echo "Available:" >&2
  ls "$ROOT/openbench/tasks" >&2
  exit 2
fi

mkdir -p "$OPENBENCH_ROOT/tasks"
rm -rf "$OPENBENCH_ROOT/tasks/$TASK"
cp -a "$TASK_SRC" "$OPENBENCH_ROOT/tasks/$TASK"

export CLAWQL_OPENBENCH=1
export CLAWQL_HARNESS_ALLOW_UNSANDBOXED=1
export CLAWQL_OPENBENCH_HARNESS="$HARNESS"

cd "$OPENBENCH_ROOT"
python3 -m bench.run --harness clawql --model "$MODEL" --task "$TASK" --trials "$TRIALS"
