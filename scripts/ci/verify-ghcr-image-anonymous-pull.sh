#!/usr/bin/env bash
# Fail if GHCR does not allow anonymous manifest reads for the given reference.
# Kyverno verifyImages and end-user `docker pull` both need public packages (or registry creds).
set -euo pipefail

raw="${1:-}"
if [[ -z "$raw" ]]; then
  echo "usage: $0 <image[:tag]|docker://image[:tag]>" >&2
  exit 1
fi

img="${raw#docker://}"
if [[ "$img" != *:* ]]; then
  img="${img}:latest"
fi

authfile="$(mktemp)"
trap 'rm -f "${authfile}"' EXIT
printf '%s\n' '{"auths":{}}' >"${authfile}"

if ! skopeo inspect --tls-verify=true --authfile "${authfile}" "docker://${img}" >/dev/null; then
  echo "ERROR: Anonymous registry read failed for docker://${img}." >&2
  echo "GHCR visibility is manual: set the container package to Public under Package settings (see docker/README.md, GHCR visibility)." >&2
  exit 1
fi

echo "OK: anonymous read works for docker://${img}"
