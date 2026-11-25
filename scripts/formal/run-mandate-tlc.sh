#!/usr/bin/env bash
# Run mandate TLC: atomic config must pass; weak config must counterexample.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/mandate"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

cp "$DIR/MandateLifecycle.tla" \
   "$DIR/MandateLifecycle.cfg" \
   "$DIR/MandateLifecycleWeak.cfg" \
   "$WORKDIR/"

cd "$WORKDIR"

echo "=== Atomic (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config MandateLifecycle.cfg MandateLifecycle
ATOMIC_EXIT=$?
set -e
if [[ "$ATOMIC_EXIT" -ne 0 ]]; then
  echo "FAIL: atomic config must report no errors (exit=$ATOMIC_EXIT)" >&2
  exit 1
fi

echo "=== Weak (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config MandateLifecycleWeak.cfg MandateLifecycle
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: atomic green; weak produced counterexample (exit=$WEAK_EXIT)"
