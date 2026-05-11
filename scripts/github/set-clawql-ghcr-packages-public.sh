#!/usr/bin/env bash
# Check that ClawQL GHCR **container** packages are **Public** (anonymous **`docker pull`** + Kyverno).
#
# GitHub’s **published** Packages REST API (see `github/rest-api-description`) includes **GET/DELETE/restore** for
# `/orgs/.../packages/...` and `/users/.../packages/...` — there is **no** supported **`PATCH`** to change
# container package visibility. **`public` / `private`** is set in the web UI: **Package settings → Danger zone →
# Change package visibility** ([docs](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)).
# Organizations can also default **new** packages to **Public** under **Organization settings → Packages**.
#
# This script **GET**s each package and prints visibility. Exits **1** if any listed package is missing or not **`public`**.
#
# Needs `gh` + **read:packages** (and repo context for **owner** unless **GHCR_PACKAGE_OWNER_OVERRIDE** is set):
#   gh auth refresh -s read:packages -h github.com
#
# Optional: GHCR_PACKAGE_OWNER_OVERRIDE=login
#           GHCR_PUBLIC_OPEN_BROWSER=1 — `open`/`xdg-open` the profile **Packages** tab once (macOS/Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PACKAGES=(clawql-mcp clawql-dashboard clawql-website clawql-panguard-mcp-bridge)

gh_pkg_path_encode() {
  python3 -c 'from urllib.parse import quote; import sys; print(quote(sys.argv[1], safe=""))' "$1"
}

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh (GitHub CLI) is required." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh auth login" >&2
  exit 1
fi

owner="${GHCR_PACKAGE_OWNER_OVERRIDE:-}"
owner_type=""
repo_owner=""
if [[ -z "${owner}" ]]; then
  repo_owner="$(gh repo view --json owner -q .owner.login)"
  owner_type="$(gh repo view --json owner -q .owner.type)"
  owner="${repo_owner}"
else
  repo_owner="$(gh repo view --json owner -q .owner.login 2>/dev/null || true)"
fi
if [[ -z "${owner}" ]]; then
  echo "ERROR: set GHCR_PACKAGE_OWNER_OVERRIDE or run from a cloned repo with gh." >&2
  exit 1
fi
if [[ -z "${owner_type}" ]]; then
  if gh api "/orgs/${owner}" >/dev/null 2>&1; then
    owner_type="Organization"
  else
    ukind="$(gh api "users/${owner}" -q .type 2>/dev/null || true)"
    if [[ "${ukind}" == "Organization" ]]; then
      owner_type="Organization"
    else
      owner_type="User"
    fi
  fi
fi

probe_list() {
  if [[ "${owner_type}" == "Organization" ]]; then
    gh api "/orgs/${owner}/packages?package_type=container&per_page=100" 2>/dev/null || echo '[]'
  else
    gh api "/users/${owner}/packages?package_type=container&per_page=100" 2>/dev/null || echo '[]'
  fi
}

resolve_api_name() {
  local slug="$1"
  local blob="$2"
  python3 -c '
import json, sys
want, blob = sys.argv[1], sys.argv[2]
try:
    data = json.loads(blob)
except json.JSONDecodeError:
    print("")
    sys.exit(0)
if not isinstance(data, list):
    print("")
    sys.exit(0)
exact, suffix = [], []
for row in data:
    n = (row.get("name") or "")
    if n == want:
        exact.append(n)
    elif n.endswith("/" + want):
        suffix.append(n)
if exact:
    print(exact[0])
elif suffix:
    print(sorted(suffix, key=len)[0])
else:
    print("")
' "${slug}" "${blob}"
}

get_visibility() {
  local enc="$1"
  local v=""
  if [[ "${owner_type}" == "Organization" ]]; then
    v="$(gh api "/orgs/${owner}/packages/container/${enc}" -q '.visibility // empty' 2>/dev/null || true)"
  else
    v="$(gh api "/users/${owner}/packages/container/${enc}" -q '.visibility // empty' 2>/dev/null || true)"
    if [[ -z "${v}" ]]; then
      v="$(gh api "/orgs/${owner}/packages/container/${enc}" -q '.visibility // empty' 2>/dev/null || true)"
    fi
  fi
  printf '%s' "${v}"
}

probe_ep="/users/${owner}/packages?package_type=container&per_page=1"
if [[ "${owner_type}" == "Organization" ]]; then
  probe_ep="/orgs/${owner}/packages?package_type=container&per_page=1"
fi
if ! gh api "${probe_ep}" >/dev/null 2>&1; then
  echo "ERROR: cannot read packages list (403?). Run: gh auth refresh -s read:packages -h github.com" >&2
  exit 1
fi

blob="$(probe_list)"

echo "GHCR GitHub Packages namespace **${owner}** (${owner_type}) — visibility (REST GET only; no API to set):"

fail=0
for slug in "${PACKAGES[@]}"; do
  api_name="$(resolve_api_name "${slug}" "${blob}")"
  enc="$(gh_pkg_path_encode "${api_name:-${slug}}")"
  vis="$(get_visibility "${enc}")"
  if [[ -z "${vis}" ]]; then
    printf '  [missing] %-22s (%s/container/%s)\n' "${slug}" "${owner}" "${api_name:-${slug}}"
    fail=1
    continue
  fi
  if [[ "${vis}" == "public" ]]; then
    printf '  [ok] %-27s visibility=%s\n' "${slug}" "${vis}"
  else
    printf '  [bad] %-27s visibility=%s (need public)\n' "${slug}" "${vis}"
    fail=1
  fi
done

echo ""
echo "Make packages public (manual, required today): https://github.com/${owner}?tab=packages → each container → Package settings → Danger zone → Change visibility → Public"
echo "Reference: https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility"
echo ""

if [[ "${GHCR_PUBLIC_OPEN_BROWSER:-}" == "1" ]]; then
  url="https://github.com/${owner}?tab=packages"
  if command -v open >/dev/null 2>&1; then open "${url}"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "${url}"; fi
fi

echo "Anonymous pull check:"
echo "  docker pull ghcr.io/${owner}/clawql-dashboard:latest"

if [[ "${fail}" -ne 0 ]]; then
  exit 1
fi
