#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-x402-settlement-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/X402Settlement.tla" "$DIR/X402Settlement.cfg" "$DIR/X402SettlementWeakSkipSettle.cfg" "$DIR/X402SettlementWeakDoubleSettle.cfg" "$DIR/X402SettlementWeakDoubleSettleSameReplica.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== X402Settlement.cfg (must PASS) ==="
bash "$EXPECT_OK" "X402Settlement.cfg" "X402Settlement"


echo "=== X402SettlementWeakSkipSettle.cfg (must violate AllowImpliesSettled) ==="
bash "$EXPECT_VIOLATION" "X402SettlementWeakSkipSettle.cfg" "X402Settlement" "AllowImpliesSettled"

echo "=== X402SettlementWeakDoubleSettle.cfg (must violate AllowAtMostOnce) ==="
bash "$EXPECT_VIOLATION" "X402SettlementWeakDoubleSettle.cfg" "X402Settlement" "AllowAtMostOnce"

echo "=== X402SettlementWeakDoubleSettleSameReplica.cfg (must violate AllowAtMostOnce) ==="
bash "$EXPECT_VIOLATION" "X402SettlementWeakDoubleSettleSameReplica.cfg" "X402Settlement" "AllowAtMostOnce"

echo "OK: x402-settlement atomic green; weak named-invariant counterexamples checked"
