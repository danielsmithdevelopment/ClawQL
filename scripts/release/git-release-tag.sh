#!/usr/bin/env bash
# Create an annotated git tag v<version> matching package.json on HEAD.
#
# Usage:
#   bash scripts/release/git-release-tag.sh           # create tag only
#   bash scripts/release/git-release-tag.sh --push    # create tag and push to origin
#   bash scripts/release/git-release-tag.sh --dry-run # print commands, do nothing
#
# Refuses if the tag already exists. With --allow-dirty, skips the clean-tree check
# (useful only when you know what you are doing).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

PUSH=false
DRY_RUN=false
ALLOW_DIRTY=false

for arg in "$@"; do
  case "${arg}" in
    --push) PUSH=true ;;
    --dry-run) DRY_RUN=true ;;
    --allow-dirty) ALLOW_DIRTY=true ;;
    *)
      echo "Unknown option: ${arg}" >&2
      echo "Usage: bash scripts/release/git-release-tag.sh [--push] [--dry-run] [--allow-dirty]" >&2
      exit 1
      ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is required." >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
if [[ -z "${VERSION}" || "${VERSION}" == "undefined" ]]; then
  echo "ERROR: could not read version from package.json" >&2
  exit 1
fi

TAG="v${VERSION}"

if [[ "${ALLOW_DIRTY}" != "true" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is not clean. Commit or stash first, or pass --allow-dirty." >&2
  git status --short >&2
  exit 1
fi

if git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "ERROR: tag ${TAG} already exists (ref: $(git rev-parse "${TAG}"))." >&2
  exit 1
fi

run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

echo "Creating annotated tag ${TAG} at HEAD ($(git rev-parse --short HEAD)) for clawql-mcp@${VERSION}"
run git tag -a "${TAG}" -m "clawql-mcp ${VERSION}"

if [[ "${PUSH}" == "true" ]]; then
  run git push origin "${TAG}"
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[dry-run] done."
else
  echo "Done. Tag: ${TAG}"
fi
