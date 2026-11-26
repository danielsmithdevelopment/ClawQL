#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/lease"
if [[ -z "${TLA2TOOLS_JAR:-}" ]]; then
  TLA2TOOLS_JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi
export TLA2TOOLS_JAR
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-lease-sweep-expiry-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/LeaseSweepExpiry.tla" "$DIR/LeaseSweepExpiry.cfg" "$DIR/LeaseSweepExpiryWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== LeaseSweepExpiry.cfg (must PASS) ==="
bash "$EXPECT_OK" "LeaseSweepExpiry.cfg" "LeaseSweepExpiry"


echo "=== LeaseSweepExpiryWeak.cfg (must violate IntentPreservedAfterSweep) ==="
bash "$EXPECT_VIOLATION" "LeaseSweepExpiryWeak.cfg" "LeaseSweepExpiry" "IntentPreservedAfterSweep"

echo "OK: lease-sweep-expiry atomic green; weak named-invariant counterexamples checked"
