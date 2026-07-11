#!/usr/bin/env bash
# Cloudflare managed tier bootstrap: same team pull + doctor gate as VM hosts.
# Workers/containers run this on first invocation; verified R2 state is the boot artifact.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${ROOT}/bootstrap-team-vault.sh" "$@"
