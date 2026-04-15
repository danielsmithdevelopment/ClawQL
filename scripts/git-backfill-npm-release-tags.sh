#!/usr/bin/env bash
# Create missing annotated tags for npm releases that predated tagging in-repo.
# Safe to re-run: skips any tag that already exists.
#
# Mapping (package.json version at commit):
#   v1.0.0 -> 4f82217  cleanup repo for npm publishing (clawql-mcp@1.0.0)
#   v1.0.1 -> ca173c5  fix(execute): honor fields on REST and multi-spec paths
#   v1.0.2 -> 4f80846  fix(execute): default output fields for GitHub pulls + bump 1.0.2
#
# Usage:
#   bash scripts/git-backfill-npm-release-tags.sh
#   bash scripts/git-backfill-npm-release-tags.sh --push   # push only newly created tags
#   bash scripts/git-backfill-npm-release-tags.sh --dry-run

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

PUSH=false
DRY_RUN=false

for arg in "$@"; do
  case "${arg}" in
    --push) PUSH=true ;;
    --dry-run) DRY_RUN=true ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: bash scripts/git-backfill-npm-release-tags.sh [--push] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

declare -a PAIRS=(
  "v1.0.0|4f82217|npm clawql-mcp@1.0.0"
  "v1.0.1|ca173c5|npm clawql-mcp@1.0.1"
  "v1.0.2|4f80846|npm clawql-mcp@1.0.2"
)

run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

created_any=false

for entry in "${PAIRS[@]}"; do
  IFS='|' read -r tag commit msg <<< "${entry}"
  if git rev-parse "${tag}" >/dev/null 2>&1; then
    echo "Skip ${tag} (already exists -> $(git rev-parse --short "${tag}"))"
    continue
  fi
  if ! git cat-file -e "${commit}^{commit}" 2>/dev/null; then
    echo "ERROR: commit ${commit} not found in this repo (needed for ${tag})." >&2
    exit 1
  fi
  echo "Create ${tag} at ${commit} — ${msg}"
  run git tag -a "${tag}" "${commit}" -m "${msg}"
  created_any=true
  if [[ "${PUSH}" == "true" ]]; then
    run git push origin "${tag}"
  fi
done

if [[ "${created_any}" != "true" ]]; then
  echo "No new tags created (all present already)."
fi
