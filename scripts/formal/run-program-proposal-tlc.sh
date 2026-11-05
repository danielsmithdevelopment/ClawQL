#!/usr/bin/env bash
# ProgramProposalGraph: target PASS; weak settled-rerun must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/program"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-program-proposal-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/ProgramProposalGraph.tla \
  "$DIR"/ProgramProposalGraph.cfg \
  "$DIR"/ProgramProposalGraphWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== ProgramProposalGraph target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ProgramProposalGraph.cfg ProgramProposalGraph
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== ProgramProposalGraph weak settled-rerun (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ProgramProposalGraphWeak.cfg ProgramProposalGraph
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: ProgramProposalGraph Safety holds; weak settled-rerun counterexample (exit=$WEAK_EXIT)"
