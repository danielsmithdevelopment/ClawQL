#!/usr/bin/env bash
# Secret-scan an OCI layout directory (golden-image pipeline local dest).
# Trivy secret scanner is the hard gate (layer-aware).
#
# Usage:
#   bash scripts/security/scan-oci-artifact-secrets.sh <oci-layout-dir>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OCI_DIR="${1:-}"
TRIVY_IMAGE="${TRIVY_SCAN_IMAGE:-ghcr.io/aquasecurity/trivy:0.59.1}"

if [[ -z "${OCI_DIR}" || ! -d "${OCI_DIR}" ]]; then
  echo "Usage: bash scripts/security/scan-oci-artifact-secrets.sh <oci-layout-dir>" >&2
  exit 2
fi

echo "== OCI artifact secret scan (${OCI_DIR}) =="

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker required for OCI secret scan" >&2
  exit 1
fi

docker run --rm \
  -v "${ROOT}:/repo:ro" \
  -v "${OCI_DIR}:/work/oci:ro" \
  "${TRIVY_IMAGE}" \
  image \
  --scanners secret \
  --exit-code 1 \
  --ignorefile /repo/.trivyignore \
  --input /work/oci

echo "scan-oci-artifact-secrets: clean"
