#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
if [[ -z "${TLA2TOOLS_JAR:-}" ]]; then
  TLA2TOOLS_JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi
export TLA2TOOLS_JAR
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-payments-hold-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/PaymentsHoldCompensation.tla" "$DIR/PaymentsHoldCompensation.cfg" "$DIR/PaymentsHoldCompensationWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== PaymentsHoldCompensation.cfg (must PASS) ==="
bash "$EXPECT_OK" "PaymentsHoldCompensation.cfg" "PaymentsHoldCompensation"


echo "=== PaymentsHoldCompensationWeak.cfg (must violate AtMostOneCapture) ==="
bash "$EXPECT_VIOLATION" "PaymentsHoldCompensationWeak.cfg" "PaymentsHoldCompensation" "AtMostOneCapture"

echo "OK: payments-hold atomic green; weak named-invariant counterexamples checked"
