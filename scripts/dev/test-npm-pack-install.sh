#!/usr/bin/env bash
# Smoke: pack all clawql-* workspace packages, then install clawql-mcp from its tarball
# with sibling packages available (simulates registry install after ordered publish).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

echo "Building workspace packages before pack smoke..."
npm run build >/dev/null

INSTALL_ROOT="$(mktemp -d)"
PACK_DIR="$(mktemp -d)"
trap 'rm -rf "${INSTALL_ROOT}" "${PACK_DIR}"' EXIT

node scripts/release/pack-workspace-packages.mjs "${PACK_DIR}"

npm pack --pack-destination "${PACK_DIR}" >/dev/null 2>&1
MCP_TARBALL="$(find "${PACK_DIR}" -maxdepth 1 -name 'clawql-mcp-*.tgz' -print -quit)"
if [[ -z "${MCP_TARBALL}" || ! -f "${MCP_TARBALL}" ]]; then
  echo "ERROR: npm pack did not produce clawql-mcp-*.tgz" >&2
  exit 1
fi

cd "${INSTALL_ROOT}"
npm init -y >/dev/null 2>&1

# Install workspace packages first (dependency order), then clawql-mcp.
mapfile -t WS_TARBALLS < <(find "${PACK_DIR}" -maxdepth 1 -name 'clawql-*.tgz' ! -name 'clawql-mcp-*.tgz' | sort)
if [[ ${#WS_TARBALLS[@]} -eq 0 ]]; then
  echo "ERROR: no clawql-* workspace tarballs in ${PACK_DIR}" >&2
  exit 1
fi
npm install "${WS_TARBALLS[@]}" >/dev/null

npm install "${MCP_TARBALL}" >/dev/null

PKG_ROOT="${INSTALL_ROOT}/node_modules/clawql-mcp"
resolve_pkg() {
  local name="$1"
  if [[ -d "${PKG_ROOT}/node_modules/${name}/dist" ]]; then
    return 0
  fi
  if [[ -d "${INSTALL_ROOT}/node_modules/${name}/dist" ]]; then
    return 0
  fi
  echo "ERROR: missing ${name}/dist (checked nested and hoisted node_modules)" >&2
  return 1
}

for name in clawql-api clawql-auth clawql-core clawql-memory clawql-pageindex clawql-documents clawql-automation clawql-sandbox clawql-inference clawql-payments clawql-ouroboros clawql-operator clawql-release; do
  resolve_pkg "${name}"
done

cd "${PKG_ROOT}"
node --input-type=module <<'NODE'
import "clawql-api";
import "clawql-core";
import "clawql-memory";
import "clawql-auth";
import "clawql-pageindex";
console.log("OK: npm pack install resolves separate clawql-* packages");
NODE

echo "OK: test-npm-pack-install.sh"
