#!/usr/bin/env bash
# Run TLC against a weak config and require a *named* invariant violation.
# Usage: expect-violation.sh <cfg> <module> <invariant> [extra java/tlc args…]
# Passes only when stdout/stderr contains: Invariant <invariant> is violated
# A parse/config error (non-zero exit without that line) fails this helper.
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <cfg> <module> <invariant> [tlc args…]" >&2
  exit 2
fi

CFG="$1"
MODULE="$2"
INVARIANT="$3"
shift 3

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

if [[ "$EXIT" -eq 0 ]]; then
  echo "FAIL: expected TLC counterexample for Invariant ${INVARIANT}, got clean exit" >&2
  cat "$LOG" >&2 || true
  exit 1
fi

if ! grep -Eq "Invariant[[:space:]]+${INVARIANT}[[:space:]]+is violated" "$LOG"; then
  echo "FAIL: TLC exited ${EXIT} but did not report 'Invariant ${INVARIANT} is violated' (parse/config errors must not pass)" >&2
  cat "$LOG" >&2 || true
  exit 1
fi

echo "OK: TLC violated Invariant ${INVARIANT} (exit=${EXIT})"
tail -n 20 "$LOG" || true
