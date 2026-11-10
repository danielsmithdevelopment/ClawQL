#!/usr/bin/env bash
# Secret-scan Helm charts we ship (values defaults, templates) before release.
#
# Usage:
#   bash scripts/security/scan-helm-artifact-secrets.sh [charts-root]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHARTS="${1:-${ROOT}/manifests/charts}"
CONFIG="${ROOT}/scripts/security/gitleaks-artifacts.toml"
GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.24.2}"

if [[ ! -d "${CHARTS}" ]]; then
  echo "scan-helm-artifact-secrets: missing ${CHARTS}" >&2
  exit 1
fi

echo "== Helm chart secret scan (${CHARTS}) =="

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source "${CHARTS}" --no-git --verbose --no-banner --redact \
    --config "${CONFIG}"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm \
    -v "${CHARTS}:/work:ro" \
    -v "${CONFIG}:/config/gitleaks.toml:ro" \
    "${GITLEAKS_IMAGE}" \
    detect --source /work --no-git --verbose --no-banner --redact \
    --config /config/gitleaks.toml
else
  echo "ERROR: need gitleaks or docker" >&2
  exit 1
fi

echo "scan-helm-artifact-secrets: clean"
