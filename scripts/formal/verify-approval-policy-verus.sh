#!/usr/bin/env bash
# Verify the ADR 0016 Phase C approval-policy Verus crate.
# Requires: Verus release binaries on PATH (verus + cargo-verus), matching rustup toolchain.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CRATE="$ROOT/formal/verus/approval-policy"
PIN_FILE="$ROOT/formal/verus/TOOLCHAIN.md"

if ! command -v cargo-verus >/dev/null 2>&1 && ! command -v cargo >/dev/null; then
  echo "cargo not found" >&2
  exit 2
fi
if ! cargo verus --help >/dev/null 2>&1; then
  echo "cargo-verus not on PATH — install Verus release (see $PIN_FILE)" >&2
  exit 2
fi

cd "$CRATE"
echo "== cargo verus verify -p approval-policy =="
cargo verus verify
echo "OK: approval-policy verified"
