#!/usr/bin/env bash
# Auto-updated for D2b: atomic requires "No error has been found";
# weak steps require a named Invariant <name> is violated via expect-violation.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/oauth"
if [[ -z "${TLA2TOOLS_JAR:-}" ]]; then
  TLA2TOOLS_JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi
export TLA2TOOLS_JAR
WORKDIR="${TMPDIR:-/tmp}/clawql-tlc-oauth-device-$$"
mkdir -p "$WORKDIR"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

cp "$DIR/OauthDeviceAuthorization.tla" "$DIR/OauthDeviceAuthorization.cfg" "$DIR/OauthDeviceAuthorizationWeak.cfg" "$WORKDIR/"
cd "$WORKDIR"

EXPECT_OK="$ROOT/scripts/formal/lib/expect-ok.sh"
EXPECT_VIOLATION="$ROOT/scripts/formal/lib/expect-violation.sh"

echo "=== OauthDeviceAuthorization.cfg (must PASS) ==="
bash "$EXPECT_OK" "OauthDeviceAuthorization.cfg" "OauthDeviceAuthorization"


echo "=== OauthDeviceAuthorizationWeak.cfg (must violate AtMostOneConsume) ==="
bash "$EXPECT_VIOLATION" "OauthDeviceAuthorizationWeak.cfg" "OauthDeviceAuthorization" "AtMostOneConsume"

echo "OK: oauth-device atomic green; weak named-invariant counterexamples checked"
