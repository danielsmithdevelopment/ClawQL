#!/usr/bin/env bash
set -euo pipefail

# Deploy ClawQL Kustomize overlays (dev/prod) with image/tag replacement.
#
# Examples:
#   ENV=dev IMAGE=us-central1-docker.pkg.dev/my-proj/clawql/clawql-mcp TAG=abc123 \
#     bash scripts/deploy-k8s.sh
#
#   ENV=prod IMAGE=ghcr.io/acme/clawql-mcp TAG=v1.2.3 DRY_RUN=true \
#     bash scripts/deploy-k8s.sh

ENVIRONMENT="${ENV:-dev}"
IMAGE="${IMAGE:-}"
TAG="${TAG:-}"
DRY_RUN="${DRY_RUN:-false}"

if [[ "${ENVIRONMENT}" != "dev" && "${ENVIRONMENT}" != "prod" ]]; then
  echo "ERROR: ENV must be 'dev' or 'prod' (got: ${ENVIRONMENT})"
  exit 1
fi

if [[ -z "${IMAGE}" || -z "${TAG}" ]]; then
  echo "ERROR: IMAGE and TAG are required."
  echo "Example:"
  echo "  ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=abc123 bash scripts/deploy-k8s.sh"
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl is required."
  exit 1
fi

OVERLAY="docker/kustomize/overlays/${ENVIRONMENT}"
if [[ ! -d "${OVERLAY}" ]]; then
  echo "ERROR: overlay not found: ${OVERLAY}"
  exit 1
fi

TARGET_IMAGE="${IMAGE}:${TAG}"
echo "==> Environment: ${ENVIRONMENT}"
echo "==> Overlay: ${OVERLAY}"
echo "==> Image: ${TARGET_IMAGE}"
echo "==> Dry run: ${DRY_RUN}"

# Overlays currently set image lines like `image: clawql-mcp:<tag>`.
# Replace that line in rendered manifests without mutating source files.
RENDER_CMD=(kubectl kustomize "${OVERLAY}")
IMAGE_REWRITE_CMD=(sed -E "s|image: clawql-mcp:[^[:space:]]+|image: ${TARGET_IMAGE}|g")

if [[ "${DRY_RUN}" == "true" ]]; then
  "${RENDER_CMD[@]}" | "${IMAGE_REWRITE_CMD[@]}" | kubectl apply --dry-run=client -f -
  exit 0
fi

"${RENDER_CMD[@]}" | "${IMAGE_REWRITE_CMD[@]}" | kubectl apply -f -

echo "Deploy complete for ${ENVIRONMENT}."
