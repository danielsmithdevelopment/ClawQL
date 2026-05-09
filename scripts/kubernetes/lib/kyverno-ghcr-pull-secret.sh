#!/usr/bin/env bash
# shellcheck shell=bash
# Create/update a docker-registry Secret in namespace **kyverno** so Kyverno verifyImages can authenticate to GHCR
# (avoids DENIED when packages are private or anonymous rate-limits apply).
#
# Used by scripts/kubernetes/local-k8s-docker-desktop.sh after the Kyverno Helm install.
#
# Env (first non-empty token wins):
#   CLAWQL_KYVERNO_GHCR_PULL_TOKEN — PAT with read:packages (preferred for Kyverno-only)
#   GITHUB_TOKEN, GH_TOKEN, CLAWQL_GITHUB_TOKEN — common repo / local env names
#   CLAWQL_GHCR_PULL_USERNAME — GHCR docker login username (default: GITHUB_ACTOR, else literal `token`)
#   CLAWQL_KYVERNO_GHCR_SECRET_NAME — Secret name (default: clawql-kyverno-ghcr-pull)
#
# kubectl: respects KUBE_CONTEXT / CLAWQL_LOCAL_K8S_CONTEXT via caller's kubectl_ctx if defined; else kubectl.

clawql_ensure_kyverno_ghcr_pull_secret() {
  local ns=kyverno
  local name="${CLAWQL_KYVERNO_GHCR_SECRET_NAME:-clawql-kyverno-ghcr-pull}"
  local token="${CLAWQL_KYVERNO_GHCR_PULL_TOKEN:-}"
  if [[ -z "${token}" ]]; then token="${GITHUB_TOKEN:-}"; fi
  if [[ -z "${token}" ]]; then token="${GH_TOKEN:-}"; fi
  if [[ -z "${token}" ]]; then token="${CLAWQL_GITHUB_TOKEN:-}"; fi
  if [[ -z "${token}" ]]; then
    return 1
  fi

  local user="${CLAWQL_GHCR_PULL_USERNAME:-}"
  if [[ -z "${user}" ]]; then user="${GITHUB_ACTOR:-}"; fi
  if [[ -z "${user}" ]]; then user="token"; fi

  echo "==> Kyverno (${ns}): docker-registry secret ${name} for GHCR (verifyImages registry client)"
  if declare -F kubectl_ctx >/dev/null 2>&1; then
    kubectl_ctx create secret docker-registry "${name}" -n "${ns}" \
      --docker-server=ghcr.io \
      --docker-username="${user}" \
      --docker-password="${token}" \
      --docker-email=not-used@example.com \
      --dry-run=client -o yaml | kubectl_ctx apply -f -
  elif [[ -n "${KUBE_CONTEXT:-}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" create secret docker-registry "${name}" -n "${ns}" \
      --docker-server=ghcr.io \
      --docker-username="${user}" \
      --docker-password="${token}" \
      --docker-email=not-used@example.com \
      --dry-run=client -o yaml | kubectl --context "${KUBE_CONTEXT}" apply -f -
  else
    kubectl create secret docker-registry "${name}" -n "${ns}" \
      --docker-server=ghcr.io \
      --docker-username="${user}" \
      --docker-password="${token}" \
      --docker-email=not-used@example.com \
      --dry-run=client -o yaml | kubectl apply -f -
  fi
}
