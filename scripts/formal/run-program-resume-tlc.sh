#!/usr/bin/env bash
# TLC dual configs for ProgramResume.tla (claim-path §5).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/program"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-program-resume-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR/ProgramResume.tla" "$DIR/ProgramResume.cfg" "$DIR/ProgramResumeWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

echo "=== ProgramResume target (must PASS) ==="
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ProgramResume.cfg ProgramResume

echo "=== ProgramResume weak (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config ProgramResumeWeak.cfg ProgramResume
WEAK=$?
set -e
if [[ "$WEAK" -eq 0 ]]; then
  echo "FAIL: weak ProgramResume config (WeakAllowCompletedRerun) must counterexample" >&2
  exit 1
fi

echo "OK: ProgramResume Safety holds; weak counterexample (exit=$WEAK)"
