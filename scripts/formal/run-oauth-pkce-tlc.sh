#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/oauth"
export TLA2TOOLS_JAR="${TLA2TOOLS_JAR:-$("$ROOT/scripts/formal/ensure-tla2tools.sh")}"
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-oauth-pkce-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/OauthPkceAuthCode.tla" "$DIR/OauthPkceAuthCode.cfg" "$DIR/OauthPkceAuthCodeWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== OauthPkceAuthCode.cfg (must PASS) ==="
bash "$EXPECT_OK" "OauthPkceAuthCode.cfg" "OauthPkceAuthCode"


echo "=== OauthPkceAuthCodeWeak.cfg (must violate AtMostOneToken) ==="
bash "$EXPECT_VIOLATION" "OauthPkceAuthCodeWeak.cfg" "OauthPkceAuthCode" "AtMostOneToken"

echo "OK: oauth-pkce atomic green; weak named-invariant counterexamples checked"
