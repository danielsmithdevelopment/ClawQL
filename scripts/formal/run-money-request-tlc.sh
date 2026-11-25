#!/usr/bin/env bash
# MoneyRequestStatus: target PASS; weak skip-accept must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/payments"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-money-request-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

cp "$DIR"/MoneyRequestStatus.tla \
  "$DIR"/MoneyRequestStatus.cfg \
  "$DIR"/MoneyRequestStatusWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== MoneyRequestStatus target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config MoneyRequestStatus.cfg MoneyRequestStatus
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== MoneyRequestStatus weak skip-accept (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config MoneyRequestStatusWeak.cfg MoneyRequestStatus
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: MoneyRequestStatus Safety holds; weak skip-accept counterexample (exit=$WEAK_EXIT)"
