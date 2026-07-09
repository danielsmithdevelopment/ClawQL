#!/usr/bin/env bash
# Smoke: npm pack → install in clean dir → resolve bundled clawql-* workspace packages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

INSTALL_ROOT="$(mktemp -d)"
PACK_DIR="$(mktemp -d)"
TARBALL=""
trap 'rm -rf "${INSTALL_ROOT}" "${PACK_DIR}"' EXIT

npm pack --pack-destination "${PACK_DIR}" >/dev/null 2>&1
TARBALL="$(find "${PACK_DIR}" -maxdepth 1 -name 'clawql-mcp-*.tgz' -print -quit)"
if [[ -z "${TARBALL}" || ! -f "${TARBALL}" ]]; then
  echo "ERROR: npm pack did not produce clawql-mcp-*.tgz in ${PACK_DIR}" >&2
  exit 1
fi

cd "${INSTALL_ROOT}"
npm init -y >/dev/null 2>&1
npm install "${TARBALL}" >/dev/null

PKG_ROOT="${INSTALL_ROOT}/node_modules/clawql-mcp"
resolve_bundled_pkg() {
  local name="$1"
  if [[ -d "${PKG_ROOT}/node_modules/${name}/dist" ]]; then
    return 0
  fi
  if [[ -d "${INSTALL_ROOT}/node_modules/${name}/dist" ]]; then
    return 0
  fi
  echo "ERROR: missing bundled ${name}/dist (checked nested and hoisted node_modules)" >&2
  return 1
}

for name in clawql-api clawql-auth clawql-core clawql-memory clawql-pageindex clawql-documents clawql-automation clawql-sandbox clawql-ouroboros clawql-operator clawql-release; do
  resolve_bundled_pkg "${name}"
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
