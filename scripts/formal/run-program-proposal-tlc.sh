#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/program"
if [[ -z "${TLA2TOOLS_JAR:-}" ]]; then
  TLA2TOOLS_JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi
export TLA2TOOLS_JAR
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-program-proposal-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/ProgramProposalGraph.tla" "$DIR/ProgramProposalGraph.cfg" "$DIR/ProgramProposalGraphWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== ProgramProposalGraph.cfg (must PASS) ==="
bash "$EXPECT_OK" "ProgramProposalGraph.cfg" "ProgramProposalGraph"


echo "=== ProgramProposalGraphWeak.cfg (must violate NoSettledRerun) ==="
bash "$EXPECT_VIOLATION" "ProgramProposalGraphWeak.cfg" "ProgramProposalGraph" "NoSettledRerun"

echo "OK: program-proposal atomic green; weak named-invariant counterexamples checked"
