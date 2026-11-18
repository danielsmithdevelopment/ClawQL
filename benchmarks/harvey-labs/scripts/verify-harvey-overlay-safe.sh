#!/usr/bin/env bash
# Smoke: clone harvey-labs, apply ClawQL overlay WITHOUT --openrouter-hooks,
# assert Harvey core files are untouched and agent_loop has no clawql markers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="${TMPDIR:-/tmp}/clawql-harvey-overlay-smoke-$$"
HARVEY="${WORK}/harvey-labs"
mkdir -p "${WORK}"
trap 'rm -rf "${WORK}"' EXIT

echo "::group::Clone harvey-labs (pinned tip SHA)"
HREF="${CLAWQL_LAB_HARVEY_REF:-7f9b1ee19f9224576a5a5143c4e6f75842ac7020}"
git clone https://github.com/harveyai/harvey-labs.git "${HARVEY}"
git -C "${HARVEY}" checkout --detach "${HREF}"
echo "ref: ${HREF}"
echo "::endgroup::"

# Layout: v1.4 = lab_core/, legacy = top-level harness/.
if [[ -f "${HARVEY}/lab_core/harness/run.py" ]]; then
  HPKG="lab_core"
else
  HPKG=""
fi

# Fingerprint Harvey-authored files before apply
fp() { sha256sum "$1" | awk '{print $1}'; }
ANTH_BEFORE="$(fp "${HARVEY}/${HPKG}/harness/adapters/anthropic.py")"
JUDGE_BEFORE="$(fp "${HARVEY}/${HPKG}/evaluation/judge.py")"
EVAL_BEFORE="$(fp "${HARVEY}/${HPKG}/evaluation/run_eval.py")"
LOOP_BEFORE="$(fp "${HARVEY}/${HPKG}/harness/agent_loop.py")"

echo "::group::Apply overlay (Harvey-safe default — no openrouter hooks)"
python3 "${ROOT}/benchmarks/harvey-labs/scripts/apply_clawql_adapter.py" \
  --harvey-labs "${HARVEY}"
echo "::endgroup::"

ANTH_AFTER="$(fp "${HARVEY}/${HPKG}/harness/adapters/anthropic.py")"
JUDGE_AFTER="$(fp "${HARVEY}/${HPKG}/evaluation/judge.py")"
EVAL_AFTER="$(fp "${HARVEY}/${HPKG}/evaluation/run_eval.py")"
LOOP_AFTER="$(fp "${HARVEY}/${HPKG}/harness/agent_loop.py")"

fail=0
if [[ "${ANTH_BEFORE}" != "${ANTH_AFTER}" ]]; then
  echo "FAIL: anthropic.py changed without --openrouter-hooks" >&2
  fail=1
fi
if [[ "${JUDGE_BEFORE}" != "${JUDGE_AFTER}" ]]; then
  echo "FAIL: judge.py changed without --openrouter-hooks" >&2
  fail=1
fi
if [[ "${EVAL_BEFORE}" != "${EVAL_AFTER}" ]]; then
  echo "FAIL: run_eval.py changed without --openrouter-hooks" >&2
  fail=1
fi
if [[ "${LOOP_BEFORE}" != "${LOOP_AFTER}" ]]; then
  echo "FAIL: agent_loop.py was modified" >&2
  fail=1
fi
if grep -qi clawql "${HARVEY}/${HPKG}/harness/agent_loop.py"; then
  echo "FAIL: agent_loop.py contains clawql" >&2
  fail=1
fi

# Our files must exist
for f in \
  "${HPKG}/harness/adapters/clawql.py" \
  "${HPKG}/harness/adapters/clawql_chat.py" \
  "${HPKG}/harness/adapters/clawql_lab_session.py" \
  "${HPKG}/harness/adapters/clawql_tools.json" \
  "${HPKG}/harness/clawql_tools.py"
do
  if [[ ! -f "${HARVEY}/${f}" ]]; then
    echo "FAIL: missing overlay file ${f}" >&2
    fail=1
  fi
done

# run.py must have marker hooks
if ! grep -q 'clawql-lab-adapter begin' "${HARVEY}/${HPKG}/harness/run.py"; then
  echo "FAIL: run.py missing ClawQL marker hooks" >&2
  fail=1
fi

if [[ "${fail}" -ne 0 ]]; then
  exit 1
fi

echo "PASS: Harvey-safe overlay — agent_loop/anthropic/judge/run_eval stock; adapters + run.py hooks present"
