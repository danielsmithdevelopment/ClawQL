#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/program"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-program-resume-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/ProgramResume.tla" "$DIR/ProgramResume.cfg" "$DIR/ProgramResumeWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== ProgramResume.cfg (must PASS) ==="
bash "$EXPECT_OK" "ProgramResume.cfg" "ProgramResume"


echo "=== ProgramResumeWeak.cfg (must violate NoCompletedStepRerun) ==="
bash "$EXPECT_VIOLATION" "ProgramResumeWeak.cfg" "ProgramResume" "NoCompletedStepRerun"

echo "OK: program-resume atomic green; weak named-invariant counterexamples checked"
