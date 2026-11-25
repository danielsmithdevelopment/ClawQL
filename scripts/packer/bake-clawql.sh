#!/usr/bin/env bash
# Bake-time provisioner: install ClawQL and prepare ~/.ClawQL skeleton (no team secrets).
# Used by Packer golden-host builds and Docker validate target.
#
# Audit 7.05: no curl|bash. Download Node + npm package with pinned versions and SHA-256 checks.
set -euo pipefail

CLAWQL_VERSION="${CLAWQL_VERSION:-latest}"
CLAWQL_HOME="${CLAWQL_HOME:-/root/.ClawQL}"
SYNC_PREFIX="${CLAWQL_SYNC_PREFIX:-teams/shared/}"
SYNC_PROVIDER="${CLAWQL_SYNC_PROVIDER:-r2}"
SYNC_BUCKET_PLACEHOLDER="${CLAWQL_SYNC_BUCKET_PLACEHOLDER:-CONFIGURE_AT_BOOT}"

# Pin Node 22 LTS tarball (override with CLAWQL_BAKE_NODE_VERSION / CLAWQL_BAKE_NODE_SHA256).
NODE_VERSION="${CLAWQL_BAKE_NODE_VERSION:-22.21.1}"
NODE_SHA256_X64="${CLAWQL_BAKE_NODE_SHA256_X64:-680d3f30b24a7ff24b98db5e96f294c0070f8f9078df658da1bce1b9c9873c88}"
NODE_SHA256_ARM64="${CLAWQL_BAKE_NODE_SHA256_ARM64:-e660365729b434af422bcd2e8e14228637ecf24a1de2cd7c916ad48f2a0521e1}"

export DEBIAN_FRONTEND=noninteractive

echo "[bake-clawql] Node + ClawQL install (node=${NODE_VERSION} clawql=${CLAWQL_VERSION})"

install_node_from_tarball() {
  local arch
  arch="$(uname -m)"
  local node_arch expect
  case "$arch" in
    x86_64|amd64) node_arch=x64; expect="${NODE_SHA256_X64}" ;;
    aarch64|arm64) node_arch=arm64; expect="${NODE_SHA256_ARM64}" ;;
    *)
      echo "[bake-clawql] unsupported arch: $arch" >&2
      exit 1
      ;;
  esac
  local url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${tmp}'" RETURN
  echo "[bake-clawql] fetching ${url}"
  curl -fsSL "$url" -o "${tmp}/node.tar.xz"
  echo "${expect}  ${tmp}/node.tar.xz" | sha256sum -c -
  tar -xJf "${tmp}/node.tar.xz" -C /usr/local --strip-components=1
  hash -r
}

if ! command -v node >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates xz-utils
  install_node_from_tarball
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "[bake-clawql] Node >= 22 required (found $(node -v)); reinstalling pinned ${NODE_VERSION}" >&2
  install_node_from_tarball
  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [ "${NODE_MAJOR}" -lt 22 ]; then
    echo "[bake-clawql] Node >= 22 still missing after tarball install" >&2
    exit 1
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[bake-clawql] npm missing after Node install" >&2
  exit 1
fi

echo "[bake-clawql] npm install -g clawql-mcp@${CLAWQL_VERSION}"
npm install -g "clawql-mcp@${CLAWQL_VERSION}"

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
