#!/usr/bin/env bash
# shellcheck shell=bash
# Select kube context for local desktop Kubernetes (Rancher Desktop k3s, Docker Desktop).
#
# Source from scripts after `cd` to repo root, then call:
#   # shellcheck disable=SC1091
#   source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
#   clawql_select_local_k8s_context
#
# Sets global KUBE_CONTEXT to a context name, or empty to use kubectl's current context.
#
# Env:
#   CLAWQL_LOCAL_K8S_CONTEXT — if non-empty, force this context (no probing).

clawql_select_local_k8s_context() {
  KUBE_CONTEXT=""
  if [[ -n "${CLAWQL_LOCAL_K8S_CONTEXT:-}" ]]; then
    KUBE_CONTEXT="${CLAWQL_LOCAL_K8S_CONTEXT}"
    echo "==> kube context: ${KUBE_CONTEXT} (CLAWQL_LOCAL_K8S_CONTEXT)"
    return 0
  fi

  local candidates=(rancher-desktop docker-desktop docker-for-desktop)
  local ctx
  for ctx in "${candidates[@]}"; do
    if kubectl config get-contexts -o name 2>/dev/null | grep -qx "${ctx}"; then
      if kubectl --context "${ctx}" cluster-info >/dev/null 2>&1; then
        KUBE_CONTEXT="${ctx}"
        echo "==> kube context: ${ctx}"
        return 0
      fi
    fi
  done

  for ctx in "${candidates[@]}"; do
    if kubectl config get-contexts -o name 2>/dev/null | grep -qx "${ctx}"; then
      KUBE_CONTEXT="${ctx}"
      echo "==> kube context: ${ctx} (kubectl cluster-info failed for this context — stale kubeconfig?)"
      return 0
    fi
  done

  local cur
  cur="$(kubectl config current-context 2>/dev/null || true)"
  echo "WARN: No rancher-desktop/docker-desktop context in kubeconfig; using current context: ${cur:-none}"
  echo "      Install Rancher Desktop or Docker Desktop Kubernetes, or set CLAWQL_LOCAL_K8S_CONTEXT."
}
