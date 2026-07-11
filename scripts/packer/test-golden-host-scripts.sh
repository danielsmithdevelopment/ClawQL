#!/usr/bin/env bash
# CI + local: validate Packer templates and golden-host shell scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

PACKER_DIR="${ROOT}/packer"

echo "==> ShellCheck packer scripts"
shellcheck scripts/packer/*.sh

echo "==> Golden-host script smoke (bake dry structure)"
test -x scripts/packer/bake-clawql.sh
test -x scripts/packer/bootstrap-team-vault.sh
test -x scripts/packer/cloudflare-bootstrap.sh

# Bootstrap must fail without bucket (no silent success)
if CLAWQL_SYNC_BUCKET='' scripts/packer/bootstrap-team-vault.sh 2>/dev/null; then
  echo "bootstrap-team-vault.sh should fail when CLAWQL_SYNC_BUCKET is empty" >&2
  exit 1
fi

echo "==> Packer init + validate (docker validate target)"
if ! command -v packer >/dev/null 2>&1; then
  echo "packer not installed — installing HashiCorp packer"
  PACKER_VERSION="${PACKER_VERSION:-1.11.2}"
  curl -fsSL "https://releases.hashicorp.com/packer/${PACKER_VERSION}/packer_${PACKER_VERSION}_linux_amd64.zip" -o /tmp/packer.zip
  unzip -qo /tmp/packer.zip -d /tmp
  export PATH="/tmp:${PATH}"
fi

cd "${PACKER_DIR}"
packer init .
packer validate .

echo "==> packer golden-host checks passed"
