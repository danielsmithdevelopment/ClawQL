#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/sources"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-pending-source-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/PendingSourceStatus.tla" "$DIR/PendingSourceStatus.cfg" "$DIR/PendingSourceStatusWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== PendingSourceStatus.cfg (must PASS) ==="
bash "$EXPECT_OK" "PendingSourceStatus.cfg" "PendingSourceStatus"


echo "=== PendingSourceStatusWeak.cfg (must violate ApproveOnlyFromPending) ==="
bash "$EXPECT_VIOLATION" "PendingSourceStatusWeak.cfg" "PendingSourceStatus" "ApproveOnlyFromPending"

echo "OK: pending-source atomic green; weak named-invariant counterexamples checked"
