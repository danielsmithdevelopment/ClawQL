#!/usr/bin/env bash
# x402 settle-before-allow TLC: atomic must pass; two weak configs must counterexample.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-x402-settlement-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

cp "$DIR/X402Settlement.tla" \
   "$DIR/X402Settlement.cfg" \
   "$DIR/X402SettlementWeakSkipSettle.cfg" \
   "$DIR/X402SettlementWeakDoubleSettle.cfg" \
   "$WORKDIR/"

cd "$WORKDIR"

echo "=== x402 settle-before-allow (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config X402Settlement.cfg X402Settlement
ATOMIC_EXIT=$?
set -e
if [[ "$ATOMIC_EXIT" -ne 0 ]]; then
  echo "FAIL: atomic X402Settlement config must report no errors (exit=$ATOMIC_EXIT)" >&2
  exit 1
fi

echo "=== Weak skip settle (must COUNTEREXAMPLE AllowImpliesSettled) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config X402SettlementWeakSkipSettle.cfg X402Settlement
WEAK1_EXIT=$?
set -e
if [[ "$WEAK1_EXIT" -eq 0 ]]; then
  echo "FAIL: WeakSkipSettle config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "=== Weak facilitator double settle (must COUNTEREXAMPLE AllowAtMostOnce) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config X402SettlementWeakDoubleSettle.cfg X402Settlement
WEAK2_EXIT=$?
set -e
if [[ "$WEAK2_EXIT" -eq 0 ]]; then
  echo "FAIL: WeakFacilitatorDoubleSettle config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: X402Settlement atomic green; both weak configs counterexample (exits=$WEAK1_EXIT,$WEAK2_EXIT)"
