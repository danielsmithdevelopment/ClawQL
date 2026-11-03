#!/usr/bin/env bash
# Run payments hold+compensation TLC: atomic must pass; weak must counterexample.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-payments-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR/PaymentsHoldCompensation.tla" \
   "$DIR/PaymentsHoldCompensation.cfg" \
   "$DIR/PaymentsHoldCompensationWeak.cfg" \
   "$WORKDIR/"

cd "$WORKDIR"

echo "=== Atomic (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config PaymentsHoldCompensation.cfg PaymentsHoldCompensation
ATOMIC_EXIT=$?
set -e
if [[ "$ATOMIC_EXIT" -ne 0 ]]; then
  echo "FAIL: atomic payments config must report no errors (exit=$ATOMIC_EXIT)" >&2
  exit 1
fi

echo "=== Weak (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config PaymentsHoldCompensationWeak.cfg PaymentsHoldCompensation
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak payments config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: payments atomic green; weak produced counterexample (exit=$WEAK_EXIT)"
