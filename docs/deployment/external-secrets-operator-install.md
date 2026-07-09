# External Secrets Operator → HashiCorp Vault sync

Use [External Secrets Operator](https://external-secrets.io/) (ESO) so **Vault KV stays the source of truth** and Kubernetes `Secret` objects refresh automatically when Vault values change.

This matches the Helm posture documented in **`docs/deployment/helm.md`** and **[`docs/deployment/vault-provider-secrets.md`](vault-provider-secrets.md)** ([#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241)): **`envFromSecret` / `envFromSecrets`** on `clawql-mcp-http` reference **Vault-synced** Secrets (do not use `.env` for cluster provider credentials).

Pinned chart (2026‑05‑05 upstream): **`external-secrets/external-secrets` chart `2.4.1`** (app **`v2.4.1`**).

---

## Local Docker Desktop / Rancher (bundled Vault + PVC)

When you use **`values-docker-desktop.yaml`**, the chart runs Vault as **standalone** with **file storage on a PVC** so KV data survives pod restarts (unlike **`server.dev`**, which was in-memory). The first successful **`make bootstrap-vault-eso`** run initializes Vault (if needed), **unseals** it using a single key, stores **`root-token`** and **`unseal-key`** in **`Secret/clawql-vault-local-bootstrap`** in the release namespace (local dev only — do not copy this pattern to production).

After **`make local-k8s-up`** (or an equivalent **`helm upgrade`** with the same values), run:

```bash
make bootstrap-vault-eso
# or: bash scripts/kubernetes/bootstrap-local-vault-and-eso.sh
```

That installs External Secrets Operator if missing, ensures Vault is initialized/unsealed, applies Vault policy + Kubernetes auth + seeds **`secret/clawql/providers`**, then applies **`ClusterSecretStore`** + **`ExternalSecret`** so **`Secret/clawql-provider-env`** exists for **`envFromSecret`** and the dashboard prefill.

If Vault is **sealed** after a cold start (uncommon when the bootstrap Secret exists), run the same bootstrap script again — it will unseal using **`clawql-vault-local-bootstrap`**. If you deleted that Secret but kept the PVC, restore the unseal material or delete the Vault PVC and re-bootstrap (KV will be recreated empty).

---

## Prerequisites

A running cluster with:

- Helm 3 installed locally
- A compatible Kubernetes version listed in the [External Secrets compatibility matrix](https://external-secrets.io/latest/guides/installation/)
- `kubectl` wired to your cluster context

Ensure **HashiCorp Vault is reachable from the `external-secrets` namespace**:

- Typical in-cluster Vault Service (bundled Helm release **`clawql`**, Vault subchart):  
  **`http://clawql-hashicorpvault.clawql.svc.cluster.local:8200`**  
  Prefer **TLS** endpoints in production (`https://…`) once Vault listens with TLS enabled.

Defense-in-depth posture (tie-in to **`docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md`**):

- **Least privilege Vault policies**: only KV paths consumed by MCP (read-only roles for ESO)
- **Short sync interval** on `ExternalSecret` + **rollout restart** MCP after sensitive rotation (pods do not always reload env on Secret update alone)
- **Istio** `AuthorizationPolicy` examples: **`vault-istio-authorizationpolicy*.yaml`**

---

## Install External Secrets Operator (pinned)

From a machine where **`helm`** is authenticated to your registry + cluster:

```bash
helm repo add external-secrets https://charts.external-secrets.io 2>/dev/null || true
helm repo update

helm upgrade --install external-secrets external-secrets/external-secrets \
  -n external-secrets \
  --create-namespace \
  --version 2.4.1 \
  --wait
```

Recommended verification:

```bash
kubectl get deploy -n external-secrets -o wide
kubectl get pods -n external-secrets
```

Identify the controller ServiceAccount Helm created (often **`external-secrets`** in **`external-secrets`** when the release name is **`external-secrets`**):

```bash
kubectl get sa -n external-secrets
```

Use that **`name`/`namespace`** in **`docs/deployment/external-secrets-vault-cluster-secret-store.yaml`** (`spec.provider.vault.auth.kubernetes.serviceAccountRef`).

---

## Vault bootstrap: policy + KV + Kubernetes auth (`clawql-eso-read`)

Run these **against a Vault that is initialized and unsealed** (`VAULT_TOKEN` Root or sufficiently privileged automation token).

**Operational note:** Prefer **automated IaC / GitOps** for production Vault policy and roles; commands below suit first bootstrap and parity with **`docs/security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md`** (least-privilege KV, short TTL roles, PICERL for rotation).

### 1 — Talk to Vault (example: port-forward)

```bash
kubectl -n clawql port-forward svc/clawql-hashicorpvault 8200:8200
export VAULT_ADDR=http://127.0.0.1:8200
vault login   # Root or break-glass / automation token — never persist in-repo
```

### 2 — Ensure KV versioned secrets (`secret`)

If `secret/` is already present and is **KV v2**, skip:

```bash
vault secrets enable -path=secret kv-v2 2>/dev/null || vault secrets list -detailed | rg '^secret/'
```

### 3 — Write least-privilege policy

From the repository root:

```bash
vault policy write clawql-eso-read "$(pwd)/docs/deployment/vault-policy-clawql-eso-read.hcl"
```

(Optional) Inline verify:

```bash
vault policy read clawql-eso-read
```

### 4 — Seed provider keys (`ExternalSecret` matches this shape)

KV v2 logical path **`secret`** + key **`clawql/providers`** with fields **`githubToken`**, **`slackToken`**, **`onyxApiToken`** matching **`vault-external-secrets-kubernetes-auth.yaml`**:

```bash
vault kv put secret/clawql/providers \
  githubToken="REPLACE_ME_GITHUB_TOKEN" \
  slackToken="REPLACE_ME_SLACK_TOKEN" \
  onyxApiToken="REPLACE_ME_ONYX_TOKEN"
```

From the repo, load a local **`.env`** into **`secret/clawql/providers`**:

- **`IMPORT_MODE=providers VAULT_TOKEN=… bash scripts/kubernetes/import-dotenv-to-vault.sh`** (runs **`kubectl exec`** into **`clawql-hashicorpvault-0`** by default), or **`npm run import-dotenv-to-vault -- --mode providers --kubectl-exec`**
- **`IMPORT_USE_HTTP=1`** with **`VAULT_ADDR`** (no **`vault`** CLI needed): **`IMPORT_MODE=providers IMPORT_USE_HTTP=1 VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=… bash scripts/kubernetes/import-dotenv-to-vault.sh`** (typical after **`kubectl port-forward -n clawql sts/clawql-hashicorpvault 8200:8200`**), or **`npm run import-dotenv-to-vault:http -- --mode providers`**

To store the **whole** `.env` at **`secret/clawql/dotenv`** instead, omit **`IMPORT_MODE`** and use **`--mode full`** (default).

See **`scripts/kubernetes/import-dotenv-to-vault.ts`** (**`--http`**, **`--kubectl-exec`**, **`VAULT_*`**).

Re-run **`vault kv put`** any time secrets change — ESO will refresh **`Secret/clawql-provider-env`** according to **`refreshInterval`**, then **roll out restart** MCP (see lower section).

### 5 — TokenReview delegation for Vault’s own ServiceAccount

Vault must be allowed to validate projected ServiceAccount JWTs against the Kubernetes API.

1. Resolve the **Vault server** ServiceAccount (`kubectl get sa -n clawql`).
2. Edit **`docs/deployment/vault-kubernetes-auth-tokenreview-rbac.yaml`** subjects if yours is not **`clawql-hashicorpvault`**, then apply:

```bash
kubectl apply -f docs/deployment/vault-kubernetes-auth-tokenreview-rbac.yaml
```

### 6 — Enable and configure **`auth/kubernetes`**

Enable the auth method (`kubernetes`):

```bash
vault auth enable kubernetes 2>/dev/null || echo "already enabled"
```

**Option A — Recommended when Vault runs as a workload in the same Kubernetes cluster (Vault ≥ 1.9.3):** configure `auth/kubernetes/config` **from inside the Vault pod** so Vault can read the reviewer JWT + CA automatically from **`/var/run/secrets/kubernetes.io/serviceaccount`** and refresh short-lived projection tokens ([HashiCorp — “Use local service account token as the reviewer JWT”](https://developer.hashicorp.com/vault/docs/auth/kubernetes#use-local-service-account-token-as-the-reviewer-jwt)).

The bundled **`hashicorp/vault`** subchart runs the server as a **StatefulSet**, not a Deployment: **`sts/<helm-release>-hashicorpvault`** (example release **`clawql`**: **`sts/clawql-hashicorpvault`**).

```bash
kubectl exec -n clawql sts/clawql-hashicorpvault -- \
  vault write auth/kubernetes/config \
    kubernetes_host="https://kubernetes.default.svc.cluster.local:443"
```

Depending on Kubernetes / Vault pairing you may once need **`disable_iss_validation=true`** per [Kubernetes 1.21 notes](https://developer.hashicorp.com/vault/docs/auth/kubernetes#kubernetes-1-21):

```bash
kubectl exec -n clawql sts/clawql-hashicorpvault -- \
  vault read auth/kubernetes/config
```

**Option B — From your laptop via `kubectl` + `vault` CLI (`VAULT_ADDR` port-forward above):** pass an explicit reviewer JWT (**rotate regularly**):

```bash
kubectl -n clawql get configmap kube-root-ca.crt -o jsonpath="{.data['ca\.crt']}" > /tmp/clawql-kube-ca.crt

REVIEWER_JWT="$(kubectl -n clawql create token clawql-hashicorpvault --duration=48h)"

vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc.cluster.local:443" \
  kubernetes_ca_cert=@/tmp/clawql-kube-ca.crt \
  token_reviewer_jwt="$REVIEWER_JWT"

rm -f /tmp/clawql-kube-ca.crt
unset REVIEWER_JWT
```

**Operational note:** Prefer **Option A** (no long-lived `token_reviewer_jwt` persisted on operators’ laptops).

### 7 — Bind role **`clawql-eso-read`** to External Secrets Operator’s ServiceAccount

Match the **ClusterSecretStore** (`external-secrets` / `external-secrets`, role **`clawql-eso-read`**, **`audiences: vault`** aligned with Vault **1.21+**:

```bash
vault write auth/kubernetes/role/clawql-eso-read \
  bound_service_account_names=external-secrets \
  bound_service_account_namespaces=external-secrets \
  policies=clawql-eso-read \
  ttl=1h \
  audience=vault
```

If your Helm release uses a non-default External Secrets SA, adjust **`bound_*`** accordingly.

Smoke path (Kubernetes auth + policy read):

```bash
JWT="$(kubectl -n external-secrets create token external-secrets --audience=vault --duration=5m)"

vault write -format=json auth/kubernetes/login role=clawql-eso-read jwt="$JWT" >/tmp/vault-login.json
jq -r .auth.client_token </tmp/vault-login.json | head -c 18 && echo "…"; rm /tmp/vault-login.json

unset JWT
```

Cross-check with [External Secrets Vault provider \*\*`audiences` note](https://external-secrets.io/latest/provider/hashicorp-vault/).

---

## Apply manifests (ClusterSecretStore + ExternalSecret)

1. Edit **`docs/deployment/external-secrets-vault-cluster-secret-store.yaml`** (`server`, **`role`** name to match Vault, **`serviceAccountRef`** to match Helm).

2. Apply:

```bash
kubectl apply -f docs/deployment/external-secrets-vault-cluster-secret-store.yaml
kubectl apply -f docs/deployment/vault-external-secrets-kubernetes-auth.yaml
```

Verify sync:

```bash
kubectl -n clawql get externalsecret clawql-provider-env -o yaml
kubectl -n clawql get secret clawql-provider-env -o yaml
```

Tune **`refreshInterval`** (for example **`5m`**) on the `ExternalSecret` if you want faster propagation vs API load tradeoff.

---

## Install / upgrade ClawQL referencing the synced Secret

```bash
helm upgrade --install clawql ./charts/clawql-mcp -n clawql --create-namespace \
  --set envFromSecret=clawql-provider-env \
  --wait
```

Bootstrap note: Helm **`secretSourcing.requireVaultBackedSecrets`** defaults to **`true`**. Set **`false`** only in lab overlays. When **`true`**, you still need **`envFromSecret`** / **`envFromSecrets`** pointing at a **`Secret`** that exists before pods start.

---

## After Vault values change → restart MCP rollout

Updating the Kubernetes `Secret` does **not** automatically reload containers that already sourced env vars at startup.

Restart after writes (your planned dashboard can call the same workflow):

```bash
kubectl rollout restart deployment/clawql-mcp-http -n clawql
kubectl rollout status deployment/clawql-mcp-http -n clawql --timeout=300s
```

---

## Istio tighten Vault reachability

After policies are deployed:

```bash
kubectl apply -f docs/deployment/vault-istio-authorizationpolicy.yaml
# ambient optional:
kubectl apply -f docs/deployment/vault-istio-authorizationpolicy-ambient-waypoint.yaml
make verify-vault-policy
```
