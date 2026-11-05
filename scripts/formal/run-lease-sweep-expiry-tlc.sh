#!/usr/bin/env bash
# LeaseSweepExpiry: target PASS; weak expiry-as-dead must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/lease"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-lease-sweep-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/LeaseSweepExpiry.tla \
  "$DIR"/LeaseSweepExpiry.cfg \
  "$DIR"/LeaseSweepExpiryWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== LeaseSweepExpiry target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config LeaseSweepExpiry.cfg LeaseSweepExpiry
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== LeaseSweepExpiry weak expiry-as-dead (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config LeaseSweepExpiryWeak.cfg LeaseSweepExpiry
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: LeaseSweepExpiry Safety holds; weak expiry-as-dead counterexample (exit=$WEAK_EXIT)"
