#!/usr/bin/env bash
# LeaseRenewAmbiguous: target PASS; weak Ambiguous / receipt-stamp / pause-clock
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
  "$DIR"/LeaseRenewAmbiguousWeakPause.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

run_expect_pass() {
  local cfg="$1" label="$2"
  echo "=== LeaseRenewAmbiguous ${label} (must PASS) ==="
  set +e
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$cfg" LeaseRenewAmbiguous
  local ec=$?
  set -e
  if [[ "$ec" -ne 0 ]]; then
    echo "FAIL: ${label} must report no errors (exit=$ec)" >&2
    exit 1
  fi
}

run_expect_ce() {
  local cfg="$1" label="$2"
  echo "=== LeaseRenewAmbiguous ${label} (must COUNTEREXAMPLE) ==="
  set +e
  java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -config "$cfg" LeaseRenewAmbiguous
  local ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    echo "FAIL: ${label} must violate Safety (got clean exit)" >&2
    exit 1
  fi
  echo "${label}_exit=$ec"
}

run_expect_pass LeaseRenewAmbiguous.cfg "target"
run_expect_ce LeaseRenewAmbiguousWeak.cfg "weak Ambiguous"
run_expect_ce LeaseRenewAmbiguousWeakReceipt.cfg "weak receipt-stamp"
run_expect_ce LeaseRenewAmbiguousWeakPause.cfg "weak holder-pause"

echo "OK: LeaseRenewAmbiguous Safety holds; all three weak configs counterexample"
