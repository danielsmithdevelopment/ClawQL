#!/usr/bin/env bash
# WebMcpDraftCandidate: target PASS; weak publish-pending must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/webmcp"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-webmcp-draft-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/WebMcpDraftCandidate.tla \
  "$DIR"/WebMcpDraftCandidate.cfg \
  "$DIR"/WebMcpDraftCandidateWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== WebMcpDraftCandidate target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config WebMcpDraftCandidate.cfg WebMcpDraftCandidate
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== WebMcpDraftCandidate weak publish-pending (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config WebMcpDraftCandidateWeak.cfg WebMcpDraftCandidate
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: WebMcpDraftCandidate Safety holds; weak publish-pending counterexample (exit=$WEAK_EXIT)"
