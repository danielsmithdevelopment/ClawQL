#!/usr/bin/env bash
# OauthPkceAuthCode: target PASS; weak non-consume must COUNTEREXAMPLE.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/formal/tla/oauth"
JAR="${TLA2TOOLS_JAR:-}"
WORKDIR="${TMPDIR:-/tmp}/clawql-oauth-pkce-tlc-$$"
mkdir -p "$WORKDIR"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

if [[ -z "$JAR" ]]; then
  JAR="$WORKDIR/tla2tools.jar"
  echo "Downloading tla2tools.jar…"
  curl -fsSL -o "$JAR" \
    "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar"
fi

cp "$DIR"/OauthPkceAuthCode.tla \
  "$DIR"/OauthPkceAuthCode.cfg \
  "$DIR"/OauthPkceAuthCodeWeak.cfg \
  "$WORKDIR/"
cd "$WORKDIR"

echo "=== OauthPkceAuthCode target (must PASS) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config OauthPkceAuthCode.cfg OauthPkceAuthCode
TARGET_EXIT=$?
set -e
if [[ "$TARGET_EXIT" -ne 0 ]]; then
  echo "FAIL: target config must report no errors (exit=$TARGET_EXIT)" >&2
  exit 1
fi

echo "=== OauthPkceAuthCode weak no-consume (must COUNTEREXAMPLE) ==="
set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config OauthPkceAuthCodeWeak.cfg OauthPkceAuthCode
WEAK_EXIT=$?
set -e
if [[ "$WEAK_EXIT" -eq 0 ]]; then
  echo "FAIL: weak config must violate Safety (got clean exit)" >&2
  exit 1
fi

echo "OK: OauthPkceAuthCode Safety holds; weak no-consume counterexample (exit=$WEAK_EXIT)"
