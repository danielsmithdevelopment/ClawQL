#!/usr/bin/env bash
# AcpCheckoutStatus: target PASS; weak complete-not-ready must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-acp-checkout-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/AcpCheckoutStatus.tla \
  "$DIR"/AcpCheckoutStatus.cfg \
  "$DIR"/AcpCheckoutStatusWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== AcpCheckoutStatus target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config AcpCheckoutStatus.cfg AcpCheckoutStatus
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== AcpCheckoutStatus weak complete-not-ready (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config AcpCheckoutStatusWeak.cfg AcpCheckoutStatus
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: AcpCheckoutStatus Safety holds; weak complete-not-ready counterexample (exit=$WEAK_EXIT)"
