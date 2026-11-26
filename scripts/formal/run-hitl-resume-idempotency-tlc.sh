#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/workflow"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-hitl-resume-idempotency-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/HitlResumeIdempotency.tla" "$DIR/HitlResumeIdempotency.cfg" "$DIR/HitlResumeIdempotencyWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== HitlResumeIdempotency.cfg (must PASS) ==="
bash "$EXPECT_OK" "HitlResumeIdempotency.cfg" "HitlResumeIdempotency"


echo "=== HitlResumeIdempotencyWeak.cfg (must violate AtMostOneResumePerEpisode) ==="
bash "$EXPECT_VIOLATION" "HitlResumeIdempotencyWeak.cfg" "HitlResumeIdempotency" "AtMostOneResumePerEpisode"

echo "OK: hitl-resume-idempotency atomic green; weak named-invariant counterexamples checked"
