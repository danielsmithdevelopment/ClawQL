#!/usr/bin/env bash
# shellcheck shell=bash
# Docker Desktop Kubernetes runs in a Linux VM where /run is often not MS_SHARED.
# Istio ambient istio-cni host-mounts /var/run/netns and fails with:
#   path /var/run/netns is mounted on /run but it is not a shared or slave mount
# Fix: enter the VM pid namespace and run mount --make-rshared on / and /run.
# Upstream context: https://github.com/istio/istio/issues/54865
#
# Usage: source this file, then clawql_docker_desktop_mount_make_rshared
# Opt out: CLAWQL_SKIP_DOCKER_DESKTOP_MOUNT_RSHARED=1

clawql_docker_desktop_mount_make_rshared() {
  if [[ "${CLAWQL_SKIP_DOCKER_DESKTOP_MOUNT_RSHARED:-0}" == "1" ]]; then
    echo "WARN: skipping Docker Desktop VM mount fix (CLAWQL_SKIP_DOCKER_DESKTOP_MOUNT_RSHARED=1)"
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker CLI not found. Ambient Istio on Docker Desktop runs mount --make-rshared inside the Linux VM via:" >&2
    echo "       docker run --rm --privileged --pid=host … nsenter …" >&2
    echo "       Install Docker Desktop or add docker to PATH." >&2
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: docker CLI cannot reach the daemon (docker info failed). Start Docker Desktop." >&2
    return 1
  fi

  echo "==> Docker Desktop Linux VM: mount --make-rshared / and /run (istio-cni /var/run/netns propagation)"

  _clawql_dd_nsenter_mount() {
    docker run --rm --privileged --pid=host "$@"
  }

  if _clawql_dd_nsenter_mount busybox:1.36 nsenter -t 1 -m -u -n -i sh -c 'mount --make-rshared / && mount --make-rshared /run'; then
    return 0
  fi
  echo "    busybox nsenter failed; retrying with alpine util-linux…"
  if docker run --rm --privileged --pid=host alpine:3.19 sh -c \
    'apk add --no-cache util-linux >/dev/null && nsenter -t 1 -m -u -n -i sh -c "mount --make-rshared / && mount --make-rshared /run"'; then
    return 0
  fi
  echo "    alpine nsenter failed; retrying with justincormack/nsenter1…"
  if docker run --rm --privileged --pid=host justincormack/nsenter1 sh -c 'mount --make-rshared / && mount --make-rshared /run'; then
    return 0
  fi

  echo "ERROR: Could not apply mount --make-rshared in the Docker Desktop VM." >&2
  echo "       Manual (interactive):" >&2
  echo "         docker run -it --rm --privileged --pid=host busybox:1.36 nsenter -t 1 -m -u -n -i sh" >&2
  echo "         mount --make-rshared / && mount --make-rshared /run && exit" >&2
  echo "       Reference: https://github.com/istio/istio/issues/54865" >&2
  return 1
}
