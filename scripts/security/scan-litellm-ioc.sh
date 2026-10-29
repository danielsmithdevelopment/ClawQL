#!/usr/bin/env bash
# Scan local Python environments for LiteLLM 1.107.0 supply-chain IoCs
# (cook.pth / cook.py / sitecustomize.py dropped into site-packages; /tmp markers).
# Run on every machine that may have done an unpinned `pip install` during the
# 2026-10-21 window — Mac mini, laptops, AgentDojo / pipx / CI runners — not only
# the ClawQL repo lockfiles.
#
# Usage: bash scripts/security/scan-litellm-ioc.sh [extra-site-packages-dirs...]
set -euo pipefail

IOC_NAMES=(cook.pth cook.py)
MARKER_GLOBS=("/tmp/remote_code_loader.lock" "/tmp/.pc_once_*")
FOUND=0

echo "== LiteLLM 1.107.0 IoC scan =="
echo "host=$(hostname) user=${USER:-?} date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

collect_sites() {
  local sites=()
  if command -v python3 >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && sites+=("$line")
    done < <(python3 - <<'PY' 2>/dev/null || true
import site, sys
paths = []
try:
    paths.extend(site.getsitepackages())
except Exception:
    pass
try:
    u = site.getusersitepackages()
    if u:
        paths.append(u)
except Exception:
    pass
for p in sys.path:
    if p and ("site-packages" in p or "dist-packages" in p):
        paths.append(p)
for p in sorted(set(paths)):
    print(p)
PY
)
  fi
  if [[ -d "${HOME}/.local/pipx" ]]; then
    while IFS= read -r d; do
      sites+=("$d")
    done < <(find "${HOME}/.local/pipx" -type d \( -name site-packages -o -name dist-packages \) 2>/dev/null || true)
  fi
  if [[ -d "${HOME}/.venv" ]]; then sites+=("${HOME}/.venv/lib"); fi
  if [[ -d "${VIRTUAL_ENV:-}" ]]; then
    while IFS= read -r d; do
      sites+=("$d")
    done < <(find "${VIRTUAL_ENV}" -type d \( -name site-packages -o -name dist-packages \) 2>/dev/null || true)
  fi
  for extra in "$@"; do
    [[ -d "$extra" ]] && sites+=("$extra")
  done
  printf '%s\n' "${sites[@]}" | awk 'NF' | sort -u
}

echo "-- site-packages / pipx --"
while IFS= read -r site; do
  [[ -d "$site" ]] || continue
  for name in "${IOC_NAMES[@]}"; do
    while IFS= read -r hit; do
      echo "IOC: $hit"
      FOUND=1
    done < <(find "$site" -name "$name" 2>/dev/null || true)
  done
  # sitecustomize.py is often legitimate; flag only when cook.pth coexists nearby
  if find "$site" -name 'cook.pth' 2>/dev/null | grep -q .; then
    while IFS= read -r hit; do
      echo "IOC(sitecustomize near cook): $hit"
      FOUND=1
    done < <(find "$site" -name 'sitecustomize.py' 2>/dev/null || true)
  fi
  if find "$site" -path '*/litellm/*' -name '*.dist-info' 2>/dev/null | head -1 | grep -q .; then
    ver=$(find "$site" -maxdepth 2 -type d -name 'litellm-*.dist-info' 2>/dev/null | head -1 || true)
    echo "note: litellm install present under $site (${ver:-unknown})"
    if [[ "${ver}" == *1.107.0* ]]; then
      echo "IOC: litellm 1.107.0 dist-info at $ver"
      FOUND=1
    fi
  fi
done < <(collect_sites "$@")

echo "-- /tmp markers --"
for g in "${MARKER_GLOBS[@]}"; do
  # shellcheck disable=SC2086
  for hit in $g; do
    if [[ -e "$hit" ]]; then
      echo "IOC: $hit"
      FOUND=1
    fi
  done
done

if [[ "$FOUND" -ne 0 ]]; then
  echo "== RESULT: COMPROMISE INDICATORS FOUND =="
  echo "Isolate the host, remove IoCs, rotate all secrets that machine could reach,"
  echo "and review Vault audit logs for that identity since 2026-10-21."
  exit 2
fi

echo "== RESULT: no cook.pth / 1.107.0 IoCs found in scanned paths =="
echo "Still scan machines not reachable from this shell (Mac mini, laptops, AgentDojo hosts)."
exit 0
