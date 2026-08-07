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

mapfile -t PUBLISH_ORDER < <(node -e "
const order=require('./scripts/release/npm-publish-order.json');
const extras=order.localPackExtras||[];
const packages=order.packages||[];
for (const name of [...extras, ...packages]) {
  if (name === 'clawql-mcp') continue;
  console.log(name);
}
")

cd "${INSTALL_ROOT}"
npm init -y >/dev/null 2>&1

# Install in topological order so each tarball's clawql-* deps resolve from
# already-installed local packages (unpublished packages 404 on the registry).
# localPackExtras (e.g. mcp-grpc-transport) install first for clawql-mcp peers.
for name in "${PUBLISH_ORDER[@]}"; do
  tarball="$(find "${PACK_DIR}" -maxdepth 1 -name "${name}-*.tgz" -print -quit)"
  if [[ -z "${tarball}" || ! -f "${tarball}" ]]; then
    echo "ERROR: missing tarball for ${name} in ${PACK_DIR}" >&2
    exit 1
  fi
  echo "Installing ${name} from $(basename "${tarball}")..."
  npm install "${tarball}" --no-fund --no-audit >/dev/null
done

echo "Installing clawql-mcp from $(basename "${MCP_TARBALL}")..."
npm install "${MCP_TARBALL}" --no-fund --no-audit >/dev/null

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

for name in clawql-api clawql-auth clawql-core clawql-codegraph clawql-memory clawql-ontology clawql-pageindex clawql-web clawql-documents clawql-automation clawql-sandbox clawql-inference clawql-payments clawql-ouroboros clawql-operator clawql-release mcp-grpc-transport; do
  resolve_pkg "${name}"
done

cd "${PKG_ROOT}"
node --input-type=module <<'NODE'
import "clawql-api";
import "clawql-core";
import "clawql-memory";
import "clawql-auth";
import "clawql-pageindex";
import "clawql-codegraph";
import "clawql-web";
console.log("OK: npm pack install resolves separate clawql-* packages");
NODE

echo "OK: test-npm-pack-install.sh"
