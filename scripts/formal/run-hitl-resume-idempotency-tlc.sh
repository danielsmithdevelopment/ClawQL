#!/usr/bin/env bash
# HitlResumeIdempotency: target PASS; weak double-resume mutation must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/workflow"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-hitl-resume-idempotency-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/HitlResumeIdempotency.tla \
  "$DIR"/HitlResumeIdempotency.cfg \
  "$DIR"/HitlResumeIdempotencyWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== HitlResumeIdempotency target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config HitlResumeIdempotency.cfg HitlResumeIdempotency
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== HitlResumeIdempotency weak double-resume (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config HitlResumeIdempotencyWeak.cfg HitlResumeIdempotency
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: HitlResumeIdempotency Safety holds; weak double-resume counterexample (exit=$WEAK_EXIT)"
