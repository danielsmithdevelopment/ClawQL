#!/usr/bin/env bash
# Smoke: npm pack → install in clean dir → resolve bundled clawql-* workspace packages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

INSTALL_ROOT="$(mktemp -d)"
TARBALL="$(mktemp --suffix=.tgz)"
trap 'rm -rf "${INSTALL_ROOT}" "${TARBALL}"' EXIT

npm pack --pack-destination "$(dirname "${TARBALL}")" >/dev/null 2>&1
mv "$(dirname "${TARBALL}")"/clawql-mcp-*.tgz "${TARBALL}"

cd "${INSTALL_ROOT}"
npm init -y >/dev/null 2>&1
npm install "${TARBALL}" >/dev/null

PKG_ROOT="${INSTALL_ROOT}/node_modules/clawql-mcp"
for name in clawql-api clawql-core clawql-memory clawql-documents clawql-automation clawql-sandbox clawql-ouroboros; do
  if [[ ! -d "${PKG_ROOT}/node_modules/${name}/dist" ]]; then
    echo "ERROR: missing bundled ${name}/dist in installed clawql-mcp" >&2
    exit 1
  fi
done

# Module resolution from the installed package root (same cwd as server startup).
cd "${PKG_ROOT}"
node --input-type=module <<'NODE'
import "clawql-api";
import "clawql-core";
import "clawql-memory";
console.log("OK: npm pack install resolves bundled clawql-* packages");
NODE

echo "OK: test-npm-pack-install.sh"
