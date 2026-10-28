#!/usr/bin/env bash
# WriteProtocol TLC: ClawQL configs must pass; weak early-not_found and peer-neither must counterexample.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/write-protocol"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-write-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/WriteProtocol.tla "$DIR"/WriteProtocol*.cfg "$WORKDIR/"
cd "$WORKDIR"

run_pass() {
  local cfg="$1"
  echo "=== PASS expected: $cfg ==="
  set +e
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$cfg" WriteProtocol
  local ec=$?
  set -e
  if [[ "$ec" -ne 0 ]]; then
    echo "FAIL: $cfg must report no errors (exit=$ec)" >&2
    exit 1
  fi
}

run_cex() {
  local cfg="$1"
  echo "=== COUNTEREXAMPLE expected: $cfg ==="
  set +e
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$cfg" WriteProtocol
  local ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    echo "FAIL: $cfg must violate Safety / NoDuplicateEffect (got clean exit)" >&2
    exit 1
  fi
}

run_pass WriteProtocol.cfg
run_pass WriteProtocolKeys.cfg
run_pass WriteProtocolNeither.cfg
run_cex WriteProtocolWeak.cfg
run_cex WriteProtocolPeerNeither.cfg

echo "OK: ClawQL write-protocol configs green; weak + peer-neither produced counterexamples"
