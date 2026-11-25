#!/usr/bin/env bash
# Download tla2tools.jar v1.8.0 and verify SHA-256 (audit 11.05).
# Echoes the absolute jar path on stdout.
set -euo pipefail

TLA2TOOLS_URL="${TLA2TOOLS_URL:-https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar}"
# sha256 of https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
TLA2TOOLS_SHA256="${TLA2TOOLS_SHA256:-fdffef247f563ef6edbfd44958d2a82db79e7564e07cb673262d896353fa6713}"

if [[ -n "${TLA2TOOLS_JAR:-}" && -f "${TLA2TOOLS_JAR}" ]]; then
  JAR="$TLA2TOOLS_JAR"
else
  CACHE_DIR="${TLA2TOOLS_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/clawql}"
  mkdir -p "$CACHE_DIR"
  JAR="${CACHE_DIR}/tla2tools-1.8.0.jar"
  if [[ ! -f "$JAR" ]]; then
    echo "Downloading tla2tools.jar…" >&2
    curl -fsSL -o "$JAR.partial" "$TLA2TOOLS_URL"
    mv "$JAR.partial" "$JAR"
  fi
fi

ACTUAL="$(sha256sum "$JAR" | awk '{print $1}')"
if [[ "$ACTUAL" != "$TLA2TOOLS_SHA256" ]]; then
  echo "FAIL: tla2tools.jar SHA-256 mismatch" >&2
  echo "  expected: $TLA2TOOLS_SHA256" >&2
  echo "  actual:   $ACTUAL" >&2
  echo "  path:     $JAR" >&2
  exit 1
fi

echo "$JAR"
