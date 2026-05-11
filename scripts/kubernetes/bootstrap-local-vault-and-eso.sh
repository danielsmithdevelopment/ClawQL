#!/usr/bin/env bash
# Idempotent bootstrap: External Secrets Operator + Vault KV/policy + Kubernetes auth + ClusterSecretStore
# + ExternalSecret for Secret/clawql-provider-env.
#
# Intended for local clusters (Docker Desktop / Rancher) using values-docker-desktop.yaml (standalone Vault + PVC).
# Legacy dev Vault (in-memory): keep VAULT_DEV_ROOT_TOKEN=root. Standalone: bootstrap Secret supplies the token.
#
# Usage (from repo root):
#   bash scripts/kubernetes/bootstrap-local-vault-and-eso.sh
#
# Env:
#   HELM_RELEASE_NAME   default clawql
#   HELM_NAMESPACE      default clawql
#   KUBE_CONTEXT        optional kubectl --context
#   VAULT_DEV_ROOT_TOKEN  default root — used only when Vault runs in server.dev mode (legacy)
#   VAULT_LOCAL_BOOTSTRAP_SECRET  default clawql-vault-local-bootstrap — holds root-token + unseal-key for standalone PVC (Docker Desktop)
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
vault_pod="${VAULT_STS}-0"
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

echo "==> Wait for Vault pod (${NS}/${vault_pod})"
# Vault Helm StatefulSet often uses updateStrategy.type=OnDelete — `kubectl rollout status` is not supported.
# Do not wait for condition=Ready: readiness stays false while Vault is sealed; this script unseals next.
_deadline=$((SECONDS + 300))
_vault_phase=""
while [[ "${SECONDS}" -lt "${_deadline}" ]]; do
  _vault_phase="$(kubectl_ctx get pod "${vault_pod}" -n "${NS}" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
  if [[ "${_vault_phase}" == "Running" ]]; then
    echo "    Vault pod is Running (may still be sealed — continuing to init/unseal)."
    break
  fi
  if [[ "${_vault_phase}" == "Failed" ]]; then
    echo "ERROR: Vault pod ${vault_pod} is Failed"
    kubectl_ctx describe pod "${vault_pod}" -n "${NS}" | tail -40 || true
    exit 1
  fi
  sleep 2
done
if [[ "${_vault_phase}" != "Running" ]]; then
  echo "ERROR: Vault pod ${vault_pod} did not reach Running within 300s (last phase: ${_vault_phase:-missing})"
  kubectl_ctx get pods -n "${NS}" -l "app.kubernetes.io/name=vault" -o wide 2>/dev/null || kubectl_ctx get pod -n "${NS}" "${vault_pod}" -o wide 2>/dev/null || true
  exit 1
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

vault_exec() {
  kubectl_ctx exec -n "${NS}" "${vault_pod}" -c vault -- "$@"
}

BOOTSTRAP_SECRET="${VAULT_LOCAL_BOOTSTRAP_SECRET:-clawql-vault-local-bootstrap}"

echo "==> Ensure Vault is initialized and unsealed (standalone + PVC or legacy dev mode)"
STATUS_JSON=""
for _ in $(seq 1 45); do
  # vault status exits 2 when sealed — still prints JSON; do not gate capture on exit code.
  STATUS_JSON="$(vault_exec sh -ec "export VAULT_ADDR=http://127.0.0.1:8200; vault status -format=json 2>/dev/null" || true)"
  if [[ -n "${STATUS_JSON}" ]] && echo "${STATUS_JSON}" | python3 -c "import json,sys; json.load(sys.stdin)" >/dev/null 2>&1; then
    break
  fi
  STATUS_JSON=""
  sleep 2
done

if [[ -z "${STATUS_JSON}" ]]; then
  echo "ERROR: Could not read valid vault status JSON from ${NS}/${vault_pod} — is Vault running?"
  exit 1
fi

initialized="$(echo "${STATUS_JSON}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('initialized', False))")"
sealed="$(echo "${STATUS_JSON}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('sealed', True))")"

if [[ "${initialized}" == "False" ]]; then
  echo "    Initializing Vault (1 unseal key) and recording bootstrap Secret/${NS}/${BOOTSTRAP_SECRET}"
  INIT_JSON="$(vault_exec sh -ec "export VAULT_ADDR=http://127.0.0.1:8200; vault operator init -key-shares=1 -key-threshold=1 -format=json")"
  # Never assign Vault's root token to ROOT — ROOT is the repo path for kubectl apply -f "${ROOT}/docs/..." below.
  VAULT_INIT_ROOT_TOKEN="$(echo "${INIT_JSON}" | python3 -c "import json,sys; print(json.load(sys.stdin)['root_token'])")"
  UNSEAL_HEX="$(echo "${INIT_JSON}" | python3 -c "import json,sys; print(json.load(sys.stdin)['unseal_keys_hex'][0])")"
  kubectl_ctx create secret generic "${BOOTSTRAP_SECRET}" -n "${NS}" \
    --from-literal=root-token="${VAULT_INIT_ROOT_TOKEN}" \
    --from-literal=unseal-key="${UNSEAL_HEX}" \
    --dry-run=client -o yaml | kubectl_ctx apply -f -
  vault_exec env VAULT_ADDR=http://127.0.0.1:8200 vault operator unseal "${UNSEAL_HEX}"
  TOKEN="${VAULT_INIT_ROOT_TOKEN}"
elif [[ "${sealed}" == "True" ]]; then
  echo "    Unsealing Vault using Secret/${NS}/${BOOTSTRAP_SECRET}"
  if ! kubectl_ctx get secret "${BOOTSTRAP_SECRET}" -n "${NS}" >/dev/null 2>&1; then
    echo "ERROR: Vault is sealed but bootstrap Secret is missing. Restore the unseal key or delete the Vault PVC and re-run this script."
    exit 1
  fi
  UNSEAL_HEX="$(kubectl_ctx get secret "${BOOTSTRAP_SECRET}" -n "${NS}" -o jsonpath='{.data.unseal-key}' | base64 -d)"
  vault_exec env VAULT_ADDR=http://127.0.0.1:8200 vault operator unseal "${UNSEAL_HEX}"
  TOKEN="$(kubectl_ctx get secret "${BOOTSTRAP_SECRET}" -n "${NS}" -o jsonpath='{.data.root-token}' | base64 -d)"
else
  if kubectl_ctx get secret "${BOOTSTRAP_SECRET}" -n "${NS}" >/dev/null 2>&1; then
    TOKEN="$(kubectl_ctx get secret "${BOOTSTRAP_SECRET}" -n "${NS}" -o jsonpath='{.data.root-token}' | base64 -d)"
  fi
fi

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
