#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/mandate"
if [[ -z "${TLA2TOOLS_JAR:-}" ]]; then
  TLA2TOOLS_JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi
export TLA2TOOLS_JAR
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-mandate-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/MandateLifecycle.tla" "$DIR/MandateLifecycle.cfg" "$DIR/MandateLifecycleWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== MandateLifecycle.cfg (must PASS) ==="
bash "$EXPECT_OK" "MandateLifecycle.cfg" "MandateLifecycle"


echo "=== MandateLifecycleWeak.cfg (must violate AtMostOneSideEffect) ==="
bash "$EXPECT_VIOLATION" "MandateLifecycleWeak.cfg" "MandateLifecycle" "AtMostOneSideEffect"

echo "OK: mandate atomic green; weak named-invariant counterexamples checked"
