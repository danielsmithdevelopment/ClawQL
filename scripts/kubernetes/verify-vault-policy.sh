#!/usr/bin/env bash
set -euo pipefail

# Validates Istio AuthorizationPolicy manifests for Vault access (examples in docs/deployment/).
# Usage:
#   CLAWQL_VAULT_POLICY_NS=clawql bash scripts/kubernetes/verify-vault-policy.sh

NS="${CLAWQL_VAULT_POLICY_NS:-clawql}"
POLICY_SIDE="${CLAWQL_VAULT_AUTH_POLICY_SIDE:-vault-allow-clawql-and-secret-sync}"
POLICY_AMBIENT="${CLAWQL_VAULT_AUTH_POLICY_AMBIENT:-vault-allow-clawql-and-secret-sync-ambient}"

log() {
  printf '%s\n' "$@"
}

die() {
  printf 'verify-vault-policy: error: %s\n' "$1" >&2
  exit 1
}

if ! command -v kubectl >/dev/null 2>&1; then
  die "kubectl not found on PATH"
fi

kubectl get ns "${NS}" >/dev/null || die "namespace ${NS} does not exist (create it or set CLAWQL_VAULT_POLICY_NS)"

_yaml_has() {
  local text="$1"
  local needle="$2"
  case "${text}" in
    *"${needle}"*) return 0 ;;
    *) return 1 ;;
  esac
}

SIDE_OK=false
AMBIENT_OK=false

if kubectl -n "${NS}" get authorizationpolicy "${POLICY_SIDE}" >/dev/null 2>&1; then
  log "${POLICY_SIDE}: OK (exists)"
  ys=$(kubectl -n "${NS}" get authorizationpolicy "${POLICY_SIDE}" -o yaml)
  for needle in "cluster.local/ns/external-secrets/sa/external-secrets" "clawql-mcp-http"; do
    if _yaml_has "${ys}" "${needle}"; then
      log "${POLICY_SIDE}: contains principal ref / SA string ${needle}"
    else
      die "${POLICY_SIDE}: missing expected ${needle} in policy YAML"
    fi
  done
  SIDE_OK=true
else
  log "${POLICY_SIDE}: not found"
fi

if kubectl -n "${NS}" get authorizationpolicy "${POLICY_AMBIENT}" >/dev/null 2>&1; then
  log "${POLICY_AMBIENT}: OK (exists)"
  ya=$(kubectl -n "${NS}" get authorizationpolicy "${POLICY_AMBIENT}" -o yaml)
  for needle in targetRefs clawql-hashicorpVault; do
    if _yaml_has "${ya}" "${needle}"; then
      log "${POLICY_AMBIENT}: contains ${needle}"
    else
      die "${POLICY_AMBIENT}: missing ${needle} in policy YAML"
    fi
  done
  for needle in "cluster.local/ns/external-secrets/sa/external-secrets" clawql-mcp-http; do
    _yaml_has "${ya}" "${needle}" || die "${POLICY_AMBIENT}: missing principal/SA string ${needle}"
  done
  AMBIENT_OK=true
else
  log "${POLICY_AMBIENT}: not found"
fi

if [ "${SIDE_OK}" != true ] && [ "${AMBIENT_OK}" != true ]; then
  die "no Vault AuthorizationPolicy found — apply docs/deployment/vault-istio-authorizationpolicy.yaml and/or vault-istio-authorizationpolicy-ambient-waypoint.yaml"
fi

if command -v istioctl >/dev/null 2>&1; then
  if kubectl -n "${NS}" get deploy clawql-mcp-http >/dev/null 2>&1; then
    log "istioctl: describe deploy/clawql-mcp-http"
    istioctl x describe pod -n "${NS}" "deploy/clawql-mcp-http" || log "istioctl describe returned non-zero — check mesh / CRDs"
  else
    log "istioctl: deploy/clawql-mcp-http not found — skip describe"
  fi
else
  log "istioctl not on PATH — skipping pod describe"
fi

log "verify-vault-policy: OK"
