#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/mandate"
if [[ -z "${TLA2TOOLS_JAR:-}" ]]; then
  TLA2TOOLS_JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi
export TLA2TOOLS_JAR
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-approval-channel-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/ApprovalChannel.tla" "$DIR/ApprovalChannel.cfg" "$DIR/ApprovalChannelWeak.cfg" "$DIR/ApprovalChannelWeakAgentCred.cfg" "$DIR/ApprovalChannelQuorum2.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== ApprovalChannel.cfg (must PASS) ==="
bash "$EXPECT_OK" "ApprovalChannel.cfg" "ApprovalChannel"

echo "=== ApprovalChannelQuorum2.cfg (must PASS) ==="
bash "$EXPECT_OK" "ApprovalChannelQuorum2.cfg" "ApprovalChannel"


echo "=== ApprovalChannelWeak.cfg (must violate NoAgentApproval) ==="
bash "$EXPECT_VIOLATION" "ApprovalChannelWeak.cfg" "ApprovalChannel" "NoAgentApproval"

echo "=== ApprovalChannelWeakAgentCred.cfg (must violate NoAgentApproval) ==="
bash "$EXPECT_VIOLATION" "ApprovalChannelWeakAgentCred.cfg" "ApprovalChannel" "NoAgentApproval"

echo "OK: approval-channel atomic green; weak named-invariant counterexamples checked"
