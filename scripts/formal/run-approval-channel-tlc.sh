#!/usr/bin/env bash
# Approval channel TLC: atomic must pass; weak (mcp approve) must counterexample.
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

echo "=== Weak mcp approve (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ApprovalChannelWeak.cfg ApprovalChannel
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak ApprovalChannel config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: ApprovalChannel atomic green; weak produced counterexample (exit=$WEAK_EXIT)"
