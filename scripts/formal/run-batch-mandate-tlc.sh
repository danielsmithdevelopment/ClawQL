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
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

cp "$DIR/BatchMandate.tla" "$DIR/BatchMandate.cfg" "$WORKDIR/"
cd "$WORKDIR"

echo "=== BatchMandate (must PASS) ==="
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config BatchMandate.cfg BatchMandate

echo "OK: BatchMandate Safety holds"
