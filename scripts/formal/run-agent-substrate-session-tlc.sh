#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/sandbox"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-agent-substrate-session-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/AgentSubstrateSession.tla" "$DIR/AgentSubstrateSession.cfg" "$DIR/AgentSubstrateSessionWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== AgentSubstrateSession.cfg (must PASS) ==="
bash "$EXPECT_OK" "AgentSubstrateSession.cfg" "AgentSubstrateSession"


echo "=== AgentSubstrateSessionWeak.cfg (must violate CreateAtMostOnce) ==="
bash "$EXPECT_VIOLATION" "AgentSubstrateSessionWeak.cfg" "AgentSubstrateSession" "CreateAtMostOnce"

echo "OK: agent-substrate-session atomic green; weak named-invariant counterexamples checked"
