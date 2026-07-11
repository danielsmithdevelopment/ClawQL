#!/usr/bin/env bash
# Bake-time provisioner: install ClawQL and prepare ~/.ClawQL skeleton (no team secrets).
# Used by Packer golden-host builds and Docker validate target.
set -euo pipefail

CLAWQL_VERSION="${CLAWQL_VERSION:-latest}"
CLAWQL_HOME="${CLAWQL_HOME:-/root/.ClawQL}"
SYNC_PREFIX="${CLAWQL_SYNC_PREFIX:-teams/shared/}"
SYNC_PROVIDER="${CLAWQL_SYNC_PROVIDER:-r2}"
SYNC_BUCKET_PLACEHOLDER="${CLAWQL_SYNC_BUCKET_PLACEHOLDER:-CONFIGURE_AT_BOOT}"

export DEBIAN_FRONTEND=noninteractive

echo "[bake-clawql] Node + ClawQL install (version=${CLAWQL_VERSION})"

if ! command -v node >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "[bake-clawql] Node >= 22 required (found $(node -v))" >&2
  exit 1
fi

export CLAWQL_VERSION
curl -fsSL https://clawql.com/install | bash

mkdir -p "${CLAWQL_HOME}/Memory" "${CLAWQL_HOME}/sources" "${CLAWQL_HOME}/Dashboard/chats"

# sync.json: bucket/prefix only — credentials injected at boot (instance metadata / Vault agent).
cat >"${CLAWQL_HOME}/sync.json" <<EOF
{
  "version": 1,
  "provider": "${SYNC_PROVIDER}",
  "bucket": "${SYNC_BUCKET_PLACEHOLDER}",
  "prefix": "${SYNC_PREFIX}"
}
EOF

if command -v clawql >/dev/null 2>&1; then
  clawql onboard --non-interactive || true
  clawql doctor || true
else
  echo "[bake-clawql] clawql CLI not on PATH after install" >&2
  exit 1
fi

echo "[bake-clawql] Golden base ready at ${CLAWQL_HOME} (team pull runs at boot)"
