#!/usr/bin/env bash
# Install the ClawQL-pinned stock celld release and verify denoland provenance.
# Attestations cover the published *.gz assets (not the unpacked binary).
set -euo pipefail

CELLD_PINNED_VERSION="${CELLD_PINNED_VERSION:-v0.6.3}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) TARGET=x86_64-unknown-linux-gnu ;;
  aarch64|arm64) TARGET=aarch64-unknown-linux-gnu ;;
  *)
    echo "unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

ASSET="celld-${TARGET}.gz"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
cd "$WORKDIR"

echo "Downloading ${CELLD_PINNED_VERSION}/${ASSET}"
curl -fsSL -o "$ASSET" \
  "https://github.com/denoland/celld/releases/download/${CELLD_PINNED_VERSION}/${ASSET}"

echo "Verifying GitHub artifact attestation (denoland/celld)"
gh attestation verify "$ASSET" --repo denoland/celld

INSTALL_ROOT="${CELLD_INSTALL_ROOT:-$HOME/.local}"
RELEASE_DIR="${INSTALL_ROOT}/lib/celld/releases/${CELLD_PINNED_VERSION}"
mkdir -p "$RELEASE_DIR" "${INSTALL_ROOT}/bin"
gunzip -c "$ASSET" > "${RELEASE_DIR}/celld"
chmod 755 "${RELEASE_DIR}/celld"
ln -sfn "../lib/celld/releases/${CELLD_PINNED_VERSION}/celld" "${INSTALL_ROOT}/bin/celld"

export PATH="${INSTALL_ROOT}/bin:$PATH"
command -v celld
celld --version | tee /dev/stderr | grep -E "${CELLD_PINNED_VERSION#v}"

echo "celld ${CELLD_PINNED_VERSION} installed + attestation verified"
