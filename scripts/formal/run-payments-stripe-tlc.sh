#!/usr/bin/env bash
# Stripe write-ahead idempotency TLC: atomic must pass; weak must counterexample.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-stripe-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

cp "$DIR/PaymentsStripeIdempotency.tla" \
   "$DIR/PaymentsStripeIdempotency.cfg" \
   "$DIR/PaymentsStripeIdempotencyWeak.cfg" \
   "$WORKDIR/"

cd "$WORKDIR"

echo "=== Atomic Stripe write-ahead (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config PaymentsStripeIdempotency.cfg PaymentsStripeIdempotency
ATOMIC_EXIT=$?
set -e
if [[ "$ATOMIC_EXIT" -ne 0 ]]; then
  echo "FAIL: atomic Stripe config must report no errors (exit=$ATOMIC_EXIT)" >&2
  exit 1
fi

echo "=== Weak (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config PaymentsStripeIdempotencyWeak.cfg PaymentsStripeIdempotency
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak Stripe config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: Stripe atomic green; weak produced counterexample (exit=$WEAK_EXIT)"
