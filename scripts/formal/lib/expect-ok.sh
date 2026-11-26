#!/usr/bin/env bash
# Run TLC against an atomic/target config and require a clean result.
# Usage: expect-ok.sh <cfg> <module> [extra java/tlc args…]
# Passes only when exit is 0 and output contains: No error has been found
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <cfg> <module> [tlc args…]" >&2
  exit 2
fi

CFG="$1"
MODULE="$2"
shift 2

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
JAR="${TLA2TOOLS_JAR:-}"
if [[ -z "$JAR" ]]; then
  JAR="$("$ROOT/scripts/formal/ensure-tla2tools.sh")"
fi

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

set +e
java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC \
  -config "$CFG" "$@" "$MODULE" >"$LOG" 2>&1
EXIT=$?
set -e

if [[ "$EXIT" -ne 0 ]]; then
  echo "FAIL: atomic TLC config must exit 0 (got ${EXIT})" >&2
  cat "$LOG" >&2 || true
  exit 1
fi

if ! grep -Fq "No error has been found" "$LOG"; then
  echo "FAIL: atomic TLC config exited 0 but missing 'No error has been found'" >&2
  cat "$LOG" >&2 || true
  exit 1
fi

echo "OK: TLC found no errors for ${MODULE} (${CFG})"
tail -n 12 "$LOG" || true
