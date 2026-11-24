#!/usr/bin/env bash
# Run reverse-engineering-of-own-artifacts CI gates against packed npm tarballs:
#   1. release-matches-source (byte digests)
#   2. bundle-size + forbid stray files / source maps
#   3. secret scan on unpacked packs (Gitleaks)
#   4. pack inventory BOM (+ optional baseline diff)
#
# Usage:
#   bash scripts/security/run-artifact-release-gates.sh [pack-dir]
#
# If pack-dir is omitted / empty, packs workspace packages + clawql-mcp into a temp dir
# (requires prior `npm run build` / prepack-ready tree). Prefer passing the dir from
# pack smoke so we do not rebuild twice.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

PACK_DIR="${1:-}"
if [[ -z "${PACK_DIR}" ]]; then
  PACK_DIR="$(mktemp -d)"
  trap 'rm -rf "${PACK_DIR}"' EXIT
  echo "Packing workspace packages into ${PACK_DIR}..."
  node scripts/release/pack-workspace-packages.mjs "${PACK_DIR}"
  npm pack --pack-destination "${PACK_DIR}" >/dev/null
fi

if [[ ! -d "${PACK_DIR}" ]]; then
  echo "ERROR: pack dir not found: ${PACK_DIR}" >&2
  exit 1
fi

shopt -s nullglob
tarballs=("${PACK_DIR}"/*.tgz)
if [[ ${#tarballs[@]} -eq 0 ]]; then
  echo "ERROR: no .tgz in ${PACK_DIR}" >&2
  exit 1
fi

echo "=== 1/4 release-matches-source ==="
node scripts/security/verify-release-matches-source.mjs "${PACK_DIR}"

echo "=== 2/4 bundle budgets ==="
node scripts/security/check-bundle-budgets.mjs "${PACK_DIR}"

echo "=== 3/4 artifact secret scan ==="
bash scripts/security/scan-artifact-secrets.sh "${PACK_DIR}"

echo "=== 4/4 pack inventory (release BOM) ==="
INV_DIR="$(mktemp -d)"
INV_OUT="${CLAWQL_PACK_INVENTORY_OUT:-${INV_DIR}/pack-inventory.json}"
mkdir -p "$(dirname "${INV_OUT}")"
node scripts/security/build-pack-inventory.mjs "${PACK_DIR}" "${INV_OUT}"
if [[ -n "${CLAWQL_PACK_INVENTORY_KEEP:-}" ]]; then
  cp -f "${INV_OUT}" "${CLAWQL_PACK_INVENTORY_KEEP}"
  echo "Copied inventory → ${CLAWQL_PACK_INVENTORY_KEEP}"
fi

BASELINE="${CLAWQL_PACK_INVENTORY_BASELINE:-${ROOT}/docs/security/baselines/npm-pack-inventory.json}"
if [[ -f "${BASELINE}" ]]; then
  # On intentional publish bumps almost every package contentId changes — use
  # CLAWQL_PACK_MAX_CHANGED (default unlimited) / --strict only on protected tags.
  MAX_ADDED="${CLAWQL_PACK_MAX_ADDED:-2}"
  MAX_REMOVED="${CLAWQL_PACK_MAX_REMOVED:-0}"
  MAX_CHANGED="${CLAWQL_PACK_MAX_CHANGED:-9999}"
  echo "Diffing against baseline ${BASELINE} (max-added=${MAX_ADDED} max-removed=${MAX_REMOVED})..."
  node scripts/security/diff-pack-inventory.mjs "${BASELINE}" "${INV_OUT}" \
    --max-added "${MAX_ADDED}" \
    --max-removed "${MAX_REMOVED}" \
    --max-changed "${MAX_CHANGED}"
else
  echo "No pack-inventory baseline at ${BASELINE} — skipping diff (upload inventory artifact / commit later)."
fi

# Optional: also emit Syft CycloneDX when available (repo lockfile SBOM remains the primary dependency BOM).
if [[ -n "${CLAWQL_PACK_SBOM_KEEP:-}" ]]; then
  SYFT_IMAGE="${SYFT_IMAGE:-anchore/syft:v1.19.0}"
  SBOM_OUT="${CLAWQL_PACK_SBOM_KEEP}"
  mkdir -p "$(dirname "${SBOM_OUT}")"
  if command -v syft >/dev/null 2>&1; then
    syft scan "${PACK_DIR}" -o "cyclonedx-json=${SBOM_OUT}" || true
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "${PACK_DIR}:/work:ro" \
      -v "$(dirname "${SBOM_OUT}"):/out" \
      "${SYFT_IMAGE}" \
      scan /work -o "cyclonedx-json=/out/$(basename "${SBOM_OUT}")" || true
  fi
fi

echo "=== artifact release gates: OK (${#tarballs[@]} tarball(s)) ==="
