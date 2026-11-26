#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/webmcp"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-webmcp-draft-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/WebMcpDraftCandidate.tla" "$DIR/WebMcpDraftCandidate.cfg" "$DIR/WebMcpDraftCandidateWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== WebMcpDraftCandidate.cfg (must PASS) ==="
bash "$EXPECT_OK" "WebMcpDraftCandidate.cfg" "WebMcpDraftCandidate"


echo "=== WebMcpDraftCandidateWeak.cfg (must violate PublishOnlyWhenApproved) ==="
bash "$EXPECT_VIOLATION" "WebMcpDraftCandidateWeak.cfg" "WebMcpDraftCandidate" "PublishOnlyWhenApproved"

echo "OK: webmcp-draft atomic green; weak named-invariant counterexamples checked"
