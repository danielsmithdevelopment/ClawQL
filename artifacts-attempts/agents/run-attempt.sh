#!/usr/bin/env bash
# Clone an attempt fork, run an agent (or replay a recorded patch), push.
#
# Live:
#   ./agents/run-attempt.sh --task tsk_7f2a --attempt att_1 --remote "$REMOTE" --token "$TOKEN"
# Replay (no model keys; labeled as replay in evidence):
#   ./agents/run-attempt.sh --replay demo/fixtures/patches/att_1.good.patch \
#     --task tsk_7f2a --attempt att_1 --remote "$REMOTE" --token "$TOKEN"

set -euo pipefail

REPLAY=""
TASK=""
ATTEMPT=""
REMOTE=""
TOKEN=""
WORKDIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --replay) REPLAY="$2"; shift 2 ;;
    --task) TASK="$2"; shift 2 ;;
    --attempt) ATTEMPT="$2"; shift 2 ;;
    --remote) REMOTE="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --workdir) WORKDIR="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REMOTE" || -z "$TOKEN" || -z "$ATTEMPT" ]]; then
  echo "need --remote --token --attempt" >&2
  exit 2
fi

WORKDIR="${WORKDIR:-$(mktemp -d -t attempt-"$ATTEMPT"-XXXX)}"
echo "workdir=$WORKDIR"

git -c http.extraHeader="Authorization: Bearer $TOKEN" clone "$REMOTE" "$WORKDIR/repo"
cd "$WORKDIR/repo"

if [[ -n "$REPLAY" ]]; then
  echo "mode=replay patch=$REPLAY (not a live agent run)"
  git apply "$REPLAY"
  git add -A
  git -c user.email="replay@artifacts-attempts.local" -c user.name="replay/$ATTEMPT" \
    commit -m "replay($ATTEMPT): apply recorded patch for task ${TASK:-unknown}"
else
  echo "mode=live — invoke your agent here (Claude Code / Codex) against the task prompt"
  echo "Set AGENT_CMD to a command that edits this checkout, then exits 0."
  : "${AGENT_CMD:?set AGENT_CMD for live runs}"
  eval "$AGENT_CMD"
  git add -A
  git -c user.email="agent@artifacts-attempts.local" -c user.name="agent/$ATTEMPT" \
    commit -m "agent($ATTEMPT): task ${TASK:-unknown}" || true
fi

git -c http.extraHeader="Authorization: Bearer $TOKEN" push origin HEAD:main
echo "pushed attempt=$ATTEMPT"
