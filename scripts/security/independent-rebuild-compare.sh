#!/usr/bin/env bash
# Independent rebuild gate: clean build of a commit → pack → compare pack inventory
# contentIds to a baseline inventory from another builder.
#
# Catches a dirty/compromised build environment that still produces packs matching
# *its own* workspace digests. Compares contentId (file digests inside the tarball),
# not raw .tgz sha256 — gzip headers are not bit-stable without SOURCE_DATE_EPOCH.
#
# Usage:
#   bash scripts/security/independent-rebuild-compare.sh <baseline-inventory.json>
#
# Env:
#   CLAWQL_REBUILD_INPLACE=1 — use the current checkout (CI second job). Default for
#     local use: create a detached git worktree at CLAWQL_REBUILD_REF.
#   CLAWQL_REBUILD_REF — git ref for worktree mode (default: HEAD)
#   CLAWQL_PACK_INVENTORY_KEEP — where to write the rebuild inventory
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="${1:-}"
if [[ -z "${BASELINE}" || ! -f "${BASELINE}" ]]; then
  echo "Usage: bash scripts/security/independent-rebuild-compare.sh <baseline-inventory.json>" >&2
  exit 2
fi

BUILD_ROOT="${ROOT}"
OWN_WT=0
WORKTREE=""

cleanup() {
  if [[ "${OWN_WT}" -eq 1 && -n "${WORKTREE}" ]]; then
    git -C "${ROOT}" worktree remove --force "${WORKTREE}" 2>/dev/null || rm -rf "${WORKTREE}"
  fi
}
trap cleanup EXIT

if [[ "${CLAWQL_REBUILD_INPLACE:-0}" == "1" ]]; then
  echo "=== Independent rebuild (in-place checkout at $(git -C "${ROOT}" rev-parse --short HEAD)) ==="
else
  REF="${CLAWQL_REBUILD_REF:-HEAD}"
  WORKTREE="${CLAWQL_REBUILD_WORKTREE:-$(mktemp -d)}"
  OWN_WT=1
  echo "=== Independent rebuild from ${REF} in worktree ${WORKTREE} ==="
  git -C "${ROOT}" worktree add --detach "${WORKTREE}" "${REF}"
  BUILD_ROOT="${WORKTREE}"
fi

cd "${BUILD_ROOT}"
npm ci
npm run build

PACK_DIR="$(mktemp -d)"
node scripts/release/pack-workspace-packages.mjs "${PACK_DIR}"
npm pack --pack-destination "${PACK_DIR}" >/dev/null

INV_OUT="${CLAWQL_PACK_INVENTORY_KEEP:-${PACK_DIR}/pack-inventory-rebuild.json}"
mkdir -p "$(dirname "${INV_OUT}")"
node scripts/security/build-pack-inventory.mjs "${PACK_DIR}" "${INV_OUT}"

# Attacker-view gates on the independent rebuild packs
bash scripts/security/run-artifact-release-gates.sh "${PACK_DIR}"

node scripts/security/diff-pack-inventory.mjs "${BASELINE}" "${INV_OUT}" \
  --max-added 0 \
  --max-removed 0 \
  --max-changed 0

echo "=== Independent rebuild: contentIds match baseline ==="
