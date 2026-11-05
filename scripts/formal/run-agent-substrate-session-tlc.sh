#!/usr/bin/env bash
# AgentSubstrateSession: target PASS; weak rebirth-after-terminate must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/sandbox"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-agent-substrate-session-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/AgentSubstrateSession.tla \
  "$DIR"/AgentSubstrateSession.cfg \
  "$DIR"/AgentSubstrateSessionWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== AgentSubstrateSession target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config AgentSubstrateSession.cfg AgentSubstrateSession
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== AgentSubstrateSession weak rebirth (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config AgentSubstrateSessionWeak.cfg AgentSubstrateSession
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: AgentSubstrateSession Safety holds; weak rebirth counterexample (exit=$WEAK_EXIT)"
