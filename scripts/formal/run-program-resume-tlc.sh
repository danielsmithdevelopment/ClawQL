#!/usr/bin/env bash
# TLC configs for ProgramResume.tla (claim-path §5).
# Target must PASS; weak completed-rerun and weak send-without-ack must COUNTEREXAMPLE.
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

cp "$DIR"/ProgramResume.tla \
  "$DIR"/ProgramResume.cfg \
  "$DIR"/ProgramResumeWeak.cfg \
  "$DIR"/ProgramResumeWeakSend.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

run_tlc() {
  local cfg="$1"
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$cfg" ProgramResume
}

echo "=== ProgramResume target (must PASS) ==="
run_tlc ProgramResume.cfg

echo "=== ProgramResume weak completed-rerun (must COUNTEREXAMPLE) ==="
set +e
run_tlc ProgramResumeWeak.cfg
WEAK=$?
set -e
if [[ "$WEAK" -eq 0 ]]; then
  echo "FAIL: weak completed-rerun config must counterexample" >&2
  exit 1
fi

echo "=== ProgramResume weak send-without-durable-ack (must COUNTEREXAMPLE) ==="
set +e
run_tlc ProgramResumeWeakSend.cfg
WEAK_SEND=$?
set -e
if [[ "$WEAK_SEND" -eq 0 ]]; then
  echo "FAIL: weak send-without-durable-ack config must counterexample IntentDurablyAckedBeforeSend" >&2
  exit 1
fi

echo "OK: ProgramResume Safety holds; weak counterexamples (rerun exit=$WEAK, send exit=$WEAK_SEND)"
