#!/usr/bin/env bash
# Secret-scan packed npm artifacts (what an attacker unpacks), not the git tree.
# Prefers Gitleaks on PATH; falls back to the OSS Docker image. Config does NOT
# allowlist dist/ (dist is exactly what ships).
#
# Usage:
#   bash scripts/security/scan-artifact-secrets.sh <pack-dir>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACK_DIR="${1:-${CLAWQL_PACK_DIR:-}}"
GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.24.2}"
CONFIG="${ROOT}/scripts/security/gitleaks-artifacts.toml"

if [[ -z "${PACK_DIR}" || ! -d "${PACK_DIR}" ]]; then
  echo "Usage: bash scripts/security/scan-artifact-secrets.sh <pack-dir>" >&2
  exit 2
fi

if [[ ! -f "${CONFIG}" ]]; then
  echo "ERROR: missing ${CONFIG}" >&2
  exit 1
fi

UNPACK="$(mktemp -d)"
trap 'rm -rf "${UNPACK}"' EXIT

shopt -s nullglob
tarballs=("${PACK_DIR}"/*.tgz)
if [[ ${#tarballs[@]} -eq 0 ]]; then
  echo "scan-artifact-secrets: no .tgz in ${PACK_DIR}" >&2
  exit 1
fi

echo "== Artifact secret scan (${#tarballs[@]} tarball(s)) =="
for tgz in "${tarballs[@]}"; do
  name="$(basename "${tgz}" .tgz)"
  dest="${UNPACK}/${name}"
  mkdir -p "${dest}"
  tar -xzf "${tgz}" -C "${dest}"
  echo "unpacked $(basename "${tgz}") → ${dest}/package"
done

run_gitleaks() {
  if command -v gitleaks >/dev/null 2>&1; then
    echo "using gitleaks CLI ($(command -v gitleaks))"
    gitleaks detect --source "${UNPACK}" --no-git --verbose --no-banner --redact \
      --config "${CONFIG}"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "using docker image ${GITLEAKS_IMAGE}"
    docker run --rm \
      -v "${UNPACK}:/work:ro" \
      -v "${CONFIG}:/config/gitleaks.toml:ro" \
      "${GITLEAKS_IMAGE}" \
      detect --source /work --no-git --verbose --no-banner --redact \
      --config /config/gitleaks.toml
    return
  fi
  echo "ERROR: need gitleaks on PATH or docker to scan artifacts" >&2
  exit 1
}

run_gitleaks

echo "scan-artifact-secrets: clean"
