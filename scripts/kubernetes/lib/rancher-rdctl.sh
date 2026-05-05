#!/usr/bin/env bash
# shellcheck shell=bash
# Locate Rancher Desktop's rdctl (often not on PATH) and run Lima VM fixes.
#
# Usage: source this file, then clawql_find_rdctl and/or clawql_rancher_lima_mount_make_rshared.

clawql_find_rdctl() {
  if [[ -n "${RDCTL_PATH:-}" && -x "${RDCTL_PATH}" ]]; then
    printf '%s\n' "${RDCTL_PATH}"
    return 0
  fi
  if command -v rdctl >/dev/null 2>&1; then
    command -v rdctl
    return 0
  fi

  local p
  if [[ "$(uname -s)" == "Darwin" ]]; then
    for p in \
      "/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/bin/rdctl" \
      "/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/arm64/bin/rdctl" \
      "/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/amd64/bin/rdctl"; do
      if [[ -x "${p}" ]]; then
        printf '%s\n' "${p}"
        return 0
      fi
    done
    local app="/Applications/Rancher Desktop.app"
    if [[ -d "${app}" ]]; then
      while IFS= read -r p; do
        if [[ -x "${p}" ]]; then
          printf '%s\n' "${p}"
          return 0
        fi
      done < <(find "${app}/Contents/Resources" -name rdctl -type f 2>/dev/null)
    fi
  fi

  # Linux app-image / typical install roots (best-effort).
  if [[ "$(uname -s)" == "Linux" ]]; then
    for p in "${HOME}/.local/share/rancher-desktop/cli/bin/rdctl" "/opt/rancher-desktop/bin/rdctl"; do
      if [[ -x "${p}" ]]; then
        printf '%s\n' "${p}"
        return 0
      fi
    done
  fi

  return 1
}

clawql_rancher_lima_mount_make_rshared() {
  local rdctl_bin
  rdctl_bin="$(clawql_find_rdctl)" || {
    echo "ERROR: rdctl not found. Rancher Desktop bundles it — add one of:" >&2
    echo "  export PATH=\"/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/bin:\$PATH\"" >&2
    echo "  export RDCTL_PATH=/path/to/rdctl   # from: find '/Applications/Rancher Desktop.app' -name rdctl" >&2
    echo "Or install: https://rancherdesktop.io/ (includes rdctl)" >&2
    return 1
  }
  echo "==> Rancher Lima: mount --make-rshared / (rdctl: ${rdctl_bin})"
  "${rdctl_bin}" shell -- sh -c 'sudo mount --make-rshared /'
}
