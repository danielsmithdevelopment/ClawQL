#!/usr/bin/env bash
# D3 wrapper: run the regulated kind driver in signed (Cosign / GHCR) mode.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export CLAWQL_REGULATED_KIND_MODE=signed
exec bash "${ROOT}/scripts/kubernetes/test-regulated-kind.sh" "$@"
