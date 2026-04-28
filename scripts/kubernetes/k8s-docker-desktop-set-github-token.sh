#!/usr/bin/env bash
# Deprecated name — use k8s-docker-desktop-set-mcp-auth.sh (GitHub + optional Cloudflare + Google).
set -euo pipefail
echo "Note: prefer scripts/kubernetes/k8s-docker-desktop-set-mcp-auth.sh (same behavior)." >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/k8s-docker-desktop-set-mcp-auth.sh" "$@"
