#!/usr/bin/env bash
# Idempotent bootstrap: External Secrets Operator + Vault KV/policy + Kubernetes auth + ClusterSecretStore
# + ExternalSecret for Secret/clawql-provider-env.
#
# Intended for local clusters (Docker Desktop / Rancher) using values-docker-desktop.yaml with
# hashicorpvault.server.dev.enabled — default root token is "root" (never use in production).
#
# Usage (from repo root):
#   bash scripts/kubernetes/bootstrap-local-vault-and-eso.sh
#
# Env:
#   HELM_RELEASE_NAME   default clawql
#   HELM_NAMESPACE      default clawql
#   KUBE_CONTEXT        optional kubectl --context
#   VAULT_DEV_ROOT_TOKEN  default root (must match hashicorpvault.server.dev.devRootToken)
#   SKIP_ESO_INSTALL    set to 1 if external-secrets is already installed
#   SKIP_VAULT_SEED     set to 1 to skip KV placeholder write (policy/auth still applied)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

REL="${HELM_RELEASE_NAME:-clawql}"
NS="${HELM_NAMESPACE:-clawql}"
ESO_NS="${EXTERNAL_SECRETS_NAMESPACE:-external-secrets}"
TOKEN="${VAULT_DEV_ROOT_TOKEN:-root}"
VAULT_STS="${REL}-hashicorpvault"
POLICY_FILE="${ROOT}/docs/deployment/vault-policy-clawql-eso-read.hcl"

kubectl_ctx() {
  if [[ -n "${KUBE_CONTEXT:-}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" "$@"
  else
    kubectl "$@"
  fi
}

helm_ctx() {
  if [[ -n "${KUBE_CONTEXT:-}" ]]; then
    helm --kube-context "${KUBE_CONTEXT}" "$@"
  else
    helm "$@"
  fi
}

echo "==> Wait for Vault StatefulSet / pod (${NS}/${VAULT_STS})"
if ! kubectl_ctx rollout status "statefulset/${VAULT_STS}" -n "${NS}" --timeout=300s; then
  echo "    rollout status unavailable for this strategy; waiting on pod readiness instead"
  kubectl_ctx wait --for=condition=Ready "pod/${VAULT_STS}-0" -n "${NS}" --timeout=300s
fi

if [[ "${SKIP_ESO_INSTALL:-0}" != "1" ]]; then
  echo "==> Install External Secrets Operator (Helm chart 2.4.1) if missing"
  if ! helm_ctx status external-secrets -n "${ESO_NS}" >/dev/null 2>&1; then
    helm repo add external-secrets https://charts.external-secrets.io >/dev/null 2>&1 || true
    helm_ctx repo update >/dev/null
    helm_ctx upgrade --install external-secrets external-secrets/external-secrets \
      -n "${ESO_NS}" \
      --create-namespace \
      --version 2.4.1 \
      --wait \
      --timeout 10m
  else
    echo "    Helm release external-secrets already present — skip"
  fi
else
  echo "==> SKIP_ESO_INSTALL=1 — assume External Secrets is installed"
fi

echo "==> TokenReview RBAC for Vault server ServiceAccount"
kubectl_ctx apply -f "${ROOT}/docs/deployment/vault-kubernetes-auth-tokenreview-rbac.yaml"

vault_pod="${VAULT_STS}-0"

vault_exec() {
  kubectl_ctx exec -n "${NS}" "${vault_pod}" -c vault -- "$@"
}

echo "==> Configure Vault (KV v2, policy, kubernetes auth, role, seed KV)"
kubectl_ctx cp "${POLICY_FILE}" "${NS}/${vault_pod}:/tmp/clawql-eso-read.hcl" -c vault
vault_exec sh -ec "export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=\"${TOKEN}\"
  vault secrets enable -path=secret kv-v2 2>/dev/null || true
  vault policy write clawql-eso-read /tmp/clawql-eso-read.hcl
  vault auth enable kubernetes 2>/dev/null || true
  vault write auth/kubernetes/config kubernetes_host=\"https://kubernetes.default.svc.cluster.local:443\"
  vault write auth/kubernetes/role/clawql-eso-read \
    bound_service_account_names=external-secrets \
    bound_service_account_namespaces=${ESO_NS} \
    policies=clawql-eso-read \
    ttl=1h \
    audience=vault
"

if [[ "${SKIP_VAULT_SEED:-0}" != "1" ]]; then
  echo "==> Seed secret/clawql/providers (placeholders — replace via import-dotenv-to-vault or vault kv put)"
  vault_exec sh -ec "export VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=\"${TOKEN}\"
    vault kv put secret/clawql/providers \
      githubToken=CHANGE_ME_GITHUB_TOKEN \
      slackToken=CHANGE_ME_SLACK_TOKEN \
      onyxApiToken=CHANGE_ME_ONYX_TOKEN
  "
else
  echo "==> SKIP_VAULT_SEED=1 — not writing placeholder KV"
fi

echo "==> Apply ClusterSecretStore + ExternalSecret"
kubectl_ctx apply -f "${ROOT}/docs/deployment/external-secrets-vault-cluster-secret-store.yaml"
kubectl_ctx apply -f "${ROOT}/docs/deployment/vault-external-secrets-kubernetes-auth.yaml"

echo "==> Wait for ExternalSecret to sync (up to 3m)"
for _ in $(seq 1 36); do
  if kubectl_ctx get secret clawql-provider-env -n "${NS}" >/dev/null 2>&1; then
    echo "OK: Secret/${NS}/clawql-provider-env exists"
    kubectl_ctx get externalsecret clawql-provider-env -n "${NS}" -o wide || true
    exit 0
  fi
  sleep 5
done

echo "WARN: Secret clawql-provider-env not ready after 3m — check:"
echo "  kubectl -n ${NS} describe externalsecret clawql-provider-env"
echo "  kubectl -n ${ESO_NS} logs deploy/external-secrets --tail=80"
exit 1
