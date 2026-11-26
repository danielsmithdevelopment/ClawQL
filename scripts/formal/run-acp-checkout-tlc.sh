#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-acp-checkout-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/AcpCheckoutStatus.tla" "$DIR/AcpCheckoutStatus.cfg" "$DIR/AcpCheckoutStatusWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== AcpCheckoutStatus.cfg (must PASS) ==="
bash "$EXPECT_OK" "AcpCheckoutStatus.cfg" "AcpCheckoutStatus"


echo "=== AcpCheckoutStatusWeak.cfg (must violate CompleteOnlyWhenReady) ==="
bash "$EXPECT_VIOLATION" "AcpCheckoutStatusWeak.cfg" "AcpCheckoutStatus" "CompleteOnlyWhenReady"

echo "OK: acp-checkout atomic green; weak named-invariant counterexamples checked"
