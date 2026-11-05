#!/usr/bin/env bash
# PaymentsLedgerLock: target PASS; weak no-fence must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-payments-ledger-lock-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/PaymentsLedgerLock.tla \
  "$DIR"/PaymentsLedgerLock.cfg \
  "$DIR"/PaymentsLedgerLockWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== PaymentsLedgerLock target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config PaymentsLedgerLock.cfg PaymentsLedgerLock
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== PaymentsLedgerLock weak no-fence (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config PaymentsLedgerLockWeak.cfg PaymentsLedgerLock
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: PaymentsLedgerLock Safety holds; weak no-fence counterexample (exit=$WEAK_EXIT)"
