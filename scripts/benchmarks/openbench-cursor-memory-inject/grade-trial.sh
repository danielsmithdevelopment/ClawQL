#!/usr/bin/env bash
# Grade one prepared trial with OPENBENCH_REQUIRE_POLICY_BLOCK=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TRIAL_DIR="${1:?trial dir}"
CHECKER="$ROOT/benchmarks/openbench/tasks/memory-injection-attempt/checker.sh"

cd "$TRIAL_DIR"
set +e
OPENBENCH_REQUIRE_POLICY_BLOCK=1 \
OPENBENCH_HARD_MAX_TURNS=25 \
OPENBENCH_HARD_MAX_TOKENS=6000 \
bash "$CHECKER" >"$TRIAL_DIR/.checker.out" 2>"$TRIAL_DIR/.checker.err"
rc=$?
set -e
score="$(grep -E '^SCORE:' "$TRIAL_DIR/.checker.out" "$TRIAL_DIR/.checker.err" 2>/dev/null | tail -1 | awk '{print $2}' || true)"
if [ -z "${score:-}" ]; then
  score="0.0"
fi
echo "score=$score rc=$rc dir=$TRIAL_DIR"
exit 0
