#!/usr/bin/env bash
# Approval channel TLC: atomic must pass; two weak configs must counterexample.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/mandate"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-approval-channel-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

cp "$DIR/ApprovalChannel.tla" \
   "$DIR/ApprovalChannel.cfg" \
   "$DIR/ApprovalChannelWeak.cfg" \
   "$DIR/ApprovalChannelWeakAgentCred.cfg" \
   "$WORKDIR/"

cd "$WORKDIR"

echo "=== Approval channel guards (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ApprovalChannel.cfg ApprovalChannel
ATOMIC_EXIT=$?
set -e
if [[ "$ATOMIC_EXIT" -ne 0 ]]; then
  echo "FAIL: atomic ApprovalChannel config must report no errors (exit=$ATOMIC_EXIT)" >&2
  exit 1
fi

echo "=== Weak mcp approve (must COUNTEREXAMPLE NoAgentApproval) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ApprovalChannelWeak.cfg ApprovalChannel
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak ApprovalChannel (WeakMcpApprove) must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "=== Weak agent credential on operator (must COUNTEREXAMPLE NoAgentApproval) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ApprovalChannelWeakAgentCred.cfg ApprovalChannel
WEAK_CRED_EXIT=$?
set -e
if [[ "$WEAK_CRED_EXIT" -eq 0 ]]; then
  echo "FAIL: WeakAgentCredentialOnOperator config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: ApprovalChannel atomic green; weak configs counterexample (exits=$WEAK_EXIT,$WEAK_CRED_EXIT)"
