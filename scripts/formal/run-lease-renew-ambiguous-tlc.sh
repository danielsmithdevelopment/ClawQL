#!/usr/bin/env bash
# LeaseRenewAmbiguous: target PASS; weak optimistic Ambiguous + weak receipt-stamp
# must each COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/lease"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-lease-renew-ambiguous-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/LeaseRenewAmbiguous.tla \
  "$DIR"/LeaseRenewAmbiguous.cfg \
  "$DIR"/LeaseRenewAmbiguousWeak.cfg \
  "$DIR"/LeaseRenewAmbiguousWeakReceipt.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== LeaseRenewAmbiguous target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config LeaseRenewAmbiguous.cfg LeaseRenewAmbiguous
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== LeaseRenewAmbiguous weak optimistic Ambiguous (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config LeaseRenewAmbiguousWeak.cfg LeaseRenewAmbiguous
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak Ambiguous config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "=== LeaseRenewAmbiguous weak receipt-stamp (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config LeaseRenewAmbiguousWeakReceipt.cfg LeaseRenewAmbiguous
RECEIPT_EXIT=$?
set -e
if [[ "$RECEIPT_EXIT" -eq 0 ]]; then
  echo "FAIL: weak receipt-stamp config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: LeaseRenewAmbiguous Safety holds; weak Ambiguous exit=$WEAK_EXIT; weak receipt exit=$RECEIPT_EXIT"
