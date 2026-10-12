#!/usr/bin/env bash
# TLC for BatchMandate.tla (ADR 0015 batch Merkle approve).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/mandate"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-batch-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR/BatchMandate.tla" "$DIR/BatchMandate.cfg" "$WORKDIR/"
cd "$WORKDIR"

echo "=== BatchMandate (must PASS) ==="
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config BatchMandate.cfg BatchMandate

echo "OK: BatchMandate Safety holds"
