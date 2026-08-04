#!/usr/bin/env bash
# Validate lending vertical Compose renders ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec bash "${ROOT}/scripts/dev/test-compose-vertical-config.sh" lending
