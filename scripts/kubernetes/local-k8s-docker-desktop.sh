#!/usr/bin/env bash
set -euo pipefail

# Install ClawQL on local desktop Kubernetes (Docker Desktop or Rancher Desktop / k3s).
#
# Default: Helm (charts/clawql-mcp + values-docker-desktop.yaml).
# Optional: Kustomize — set CLAWQL_LOCAL_K8S_INSTALLER=kustomize (Helm is still required for Kyverno).
#
# Admission: installs Kyverno and a ClusterPolicy (Cosign keyless verifyImages for ClawQL GHCR
# images). Unsigned local MCP/UI image builds are not supported — use signed images from GHCR.
#
# Optional ingress-nginx when Istio clawql-mcp-ingress is absent or you force both controllers:
#   CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX unset → auto: skips nginx whenever Istio north-south gateway is on (single :80 listener).
#   CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=1|0 explicit.
# Dual controllers (experimental): CLAWQL_LOCAL_K8S_INGRESS_NGINX_WITH_ISTIO=1 CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=1
# When Istio replaces nginx, leftover ingress-nginx causes *.localhost → nginx default-backend 404 — auto-uninstall:
#   CLAWQL_LOCAL_K8S_REMOVE_STALE_INGRESS_NGINX_WITH_ISTIO=1 (default). Set 0 to keep an old ingress-nginx release.
#
# Istio (default on): CLAWQL_LOCAL_K8S_ISTIO unset → ambient mesh everywhere (Docker Desktop + Rancher).
# Workloads use ztunnel (no Envoy sidecars). North-south MCP: Istio Gateway + VirtualService → clawql-mcp-http:8080
# (see install-istio-docker-desktop.sh). If istio-cni fails on Rancher/Lima, fix VM mounts (e.g. --make-rshared /)
# or set CLAWQL_LOCAL_K8S_ISTIO=0 to skip mesh.
# Set CLAWQL_LOCAL_K8S_ISTIO=sidecar only for legacy debugging; disable mesh: CLAWQL_LOCAL_K8S_ISTIO=0 (or off|false|none).
# Tune addons: CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS, CLAWQL_ISTIO_INSTALL_LOKI_TEMPO (see docker/README.md).
#
# When Istio ambient + ingress gateway are on, CLUSTERIP defaults to 1: Helm passes --set service.type=ClusterIP so
# Helm owns svc/clawql-mcp-http (no kubectl patch — avoids SSA conflicts with manager kubectl-patch). Set
# CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP=0 to keep MCP Service LoadBalancer :8080 from values-docker-desktop.
# VirtualServices in docker/istio/docker-desktop/clawql-localhost-vs-*.yaml route *.localhost when nginx is skipped.
#
# Optional: CLAWQL_HELM_TIMEOUT — helm --wait timeout (defaults: 45m full stack, 8m quick stack).
# Optional: CLAWQL_ISTIO_HELM_TIMEOUT / CLAWQL_ISTIO_ZTUNNEL_HELM_TIMEOUT — Istio sub-chart --wait (see install-istio-docker-desktop.sh; ztunnel often needs the extra margin).
# Optional: CLAWQL_SKIP_DOCKER_DESKTOP_MOUNT_RSHARED=1 — skip automatic Docker Desktop VM mount --make-rshared (breaks ambient istio-cni on many setups).
# Optional: CLAWQL_LOCAL_K8S_FULL_STACK=0 — quick MCP+UI only (skips Onyx/Flink/pipeline/NATS; short helm --wait).
#
# Optional: CLAWQL_KYVERNO_CHART_VERSION — Kyverno Helm chart version (default 3.7.2).
#
# Optional: CLAWQL_LOCAL_K8S_KYVERNO_CRDS_MIGRATION=1 — keep Kyverno chart default crds.migration
# (post-upgrade Job pulls reg.kyverno.io/kyverno/kyverno-cli). Default off for Docker Desktop
# because that Job often hits ErrImagePull on restricted networks; greenfield local clusters do not
# need CRD migration. Turn on if you upgrade Kyverno across major versions and rely on upstream migration.
#
# Optional: CLAWQL_LOCAL_K8S_VAULT_BACKEND=hostPath|pvc (default hostPath).
# - hostPath: mount $HOME/.ClawQL into the pod at /vault (easy local inspection).
# - pvc:      keep vault data in-cluster via chart PVC (no host FS permission friction).
#
# Optional: CLAWQL_LOCAL_K8S_TRIM_KUBE_SYSTEM_CPU_REQUESTS=1 (default) — lowers coredns + metrics-server
# CPU requests (100m → 25m) on tight single-node clusters. Set 0 to leave kube-system untouched.
#
# Requires: kubectl, Helm 3. A local cluster from Docker Desktop (context docker-desktop) or
# Rancher Desktop (rancher-desktop). The script picks the first *reachable* of:
#   rancher-desktop, docker-desktop, docker-for-desktop
# so a stale docker-desktop entry does not block Rancher Desktop (override with CLAWQL_LOCAL_K8S_CONTEXT).
#
# Docker / nerdctl is not required unless other tooling needs it.
#
# Usage:
#   bash scripts/kubernetes/local-k8s-docker-desktop.sh
#   CLAWQL_LOCAL_K8S_INSTALLER=kustomize bash scripts/kubernetes/local-k8s-docker-desktop.sh
#
# MCP: with default ambient Istio — **http://127.0.0.1/mcp** (Cursor on Docker Desktop macOS; avoids localhost→::1),
# **http://localhost/mcp**, **http://clawql-mcp.localhost/mcp** via Gateway+VirtualService (.cursor/mcp.json.example).
# Or Ingress **http://clawql-mcp.localhost/mcp** when :80 reaches ingress-nginx.
# UI (Ingress): http://docs.localhost
# Health (Ingress): curl -s http://clawql-mcp.localhost/healthz

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

INSTALLER="${CLAWQL_LOCAL_K8S_INSTALLER:-helm}"
CHART="${ROOT}/charts/clawql-mcp"
VALUES_LOCAL="${CHART}/values-docker-desktop.yaml"
KUSTOMIZE_OVERLAY="${ROOT}/docker/kustomize/overlays/local"
RELEASE_NAME="${HELM_RELEASE_NAME:-clawql}"
NAMESPACE="${HELM_NAMESPACE:-clawql}"
# Default Istio mode: ambient (set after kube context is selected).
# Opt out with CLAWQL_LOCAL_K8S_ISTIO=0|off|false|none.
# Portable unset test (macOS ships Bash 3.2 — do not use [[ -v ]]).
if [[ -z "${CLAWQL_LOCAL_K8S_ISTIO+x}" ]]; then
  INSTALL_ISTIO="ambient"
else
  case "${CLAWQL_LOCAL_K8S_ISTIO}" in
    ""|0|off|OFF|false|FALSE|no|NO|skip|SKIP|none|NONE)
      INSTALL_ISTIO=""
      ;;
    ambient|Ambient|AMBIENT)
      INSTALL_ISTIO="ambient"
      ;;
    sidecar|Sidecar|SIDECAR)
      INSTALL_ISTIO="sidecar"
      ;;
    *)
      echo "ERROR: CLAWQL_LOCAL_K8S_ISTIO must be ambient, sidecar, or 0/off/false/none (got: ${CLAWQL_LOCAL_K8S_ISTIO})"
      exit 1
      ;;
  esac
fi
# Auto-skip ingress-nginx when Istio north-south gateway + VirtualServices own :80 (see install-istio-docker-desktop.sh).
if [[ -z "${CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX+x}" ]]; then
  if [[ -n "${INSTALL_ISTIO}" ]] && [[ "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" ]] && [[ "${CLAWQL_LOCAL_K8S_INGRESS_NGINX_WITH_ISTIO:-0}" != "1" ]]; then
    INSTALL_INGRESS_NGINX=0
  else
    INSTALL_INGRESS_NGINX=1
  fi
else
  INSTALL_INGRESS_NGINX="${CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX}"
fi
# Ambient Istio: default MCP Service → ClusterIP before Helm (Istio gateway north-south). Do not kubectl-patch
# .spec.type afterward — Helm server-side apply conflicts with field manager kubectl-patch on upgrade.
if [[ -n "${INSTALL_ISTIO}" && "${INSTALL_ISTIO}" == "ambient" ]]; then
  : "${CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP:=1}"
fi
# Default FULL stack (values-docker-desktop.yaml as written: Onyx + Flink + pipeline + NATS).
# Fast MCP+UI only (not default): CLAWQL_LOCAL_K8S_FULL_STACK=0 make local-k8s-up  (short helm --wait).
CLAWQL_LOCAL_K8S_FULL_STACK="${CLAWQL_LOCAL_K8S_FULL_STACK:-1}"
HELM_QUICK_SET_ARGS=()
if [[ "${CLAWQL_LOCAL_K8S_FULL_STACK}" == "0" ]]; then
  _helm_timeout_default="8m"
  HELM_QUICK_SET_ARGS=(
    --set onyx.enabled=false
    --set flink.enabled=false
    --set documentPipeline.enabled=false
    --set enableOnyx=false
    --set enableOuroboros=false
    --set nats.enabled=false
    --set providerIngress.enabled=false
  )
else
  _helm_timeout_default="45m"
fi
HELM_OFFLOAD_LOCALHOST_INGRESS_ARGS=()
if [[ "${INSTALL_INGRESS_NGINX}" == "0" ]] && [[ -n "${INSTALL_ISTIO}" ]]; then
  HELM_OFFLOAD_LOCALHOST_INGRESS_ARGS=(
    --set ingress.enabled=false
    --set ui.ingress.enabled=false
    --set providerIngress.enabled=false
  )
fi
HELM_MCP_SVC_TYPE_ARGS=()
if [[ -n "${INSTALL_ISTIO}" ]] && [[ "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" ]] && [[ "${CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP:-0}" == "1" ]]; then
  HELM_MCP_SVC_TYPE_ARGS=(--set service.type=ClusterIP)
fi
HELM_TIMEOUT="${CLAWQL_HELM_TIMEOUT:-${_helm_timeout_default}}"
ISTIO_HEAVY_OBS="${CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS:-1}"
KYVERNO_CHART_VERSION="${CLAWQL_KYVERNO_CHART_VERSION:-3.7.2}"
KYVERNO_CRDS_MIGRATION="${CLAWQL_LOCAL_K8S_KYVERNO_CRDS_MIGRATION:-0}"
VAULT_BACKEND="${CLAWQL_LOCAL_K8S_VAULT_BACKEND:-hostPath}"

# Mount a host Obsidian vault (same default as docker-compose: ~/.ClawQL).
VAULT_HOST_PATH="${CLAWQL_LOCAL_VAULT_HOST_PATH:-$HOME/.ClawQL}"

echo "==> Installer: ${INSTALLER} (set CLAWQL_LOCAL_K8S_INSTALLER=kustomize for Kustomize)"
if [[ "${INSTALL_INGRESS_NGINX}" == "0" ]] && [[ -n "${INSTALL_ISTIO}" ]]; then
  echo "==> ingress-nginx: skipped (Istio Gateway + VirtualServices own :80 — LoadBalancer on docker/rancher kube contexts, hostNetwork on other locals; see install-istio-docker-desktop.sh)"
elif [[ "${INSTALL_INGRESS_NGINX}" == "1" ]]; then
  echo "==> ingress-nginx: will install (set CLAWQL_LOCAL_K8S_INSTALL_INGRESS_NGINX=0 to skip, or unset for auto when Istio gateway is on)"
fi
if [[ "${CLAWQL_LOCAL_K8S_FULL_STACK}" == "0" ]]; then
  echo "==> Helm workload scope: QUICK (MCP + UI only; Onyx/Flink/pipeline/NATS off). Full default: unset CLAWQL_LOCAL_K8S_FULL_STACK or set =1"
  echo "==> Helm --wait timeout: ${HELM_TIMEOUT} (override CLAWQL_HELM_TIMEOUT)"
else
  echo "==> Helm workload scope: FULL (values-docker-desktop.yaml — Onyx, Flink, document pipeline, NATS)"
  echo "==> Helm --wait timeout: ${HELM_TIMEOUT} (override CLAWQL_HELM_TIMEOUT for cold pulls / slow nodes)"
fi
if [[ "${VAULT_BACKEND}" == "hostPath" ]]; then
  echo "==> Obsidian vault hostPath (clawql-mcp-http): ${VAULT_HOST_PATH}"
  echo "    (override with CLAWQL_LOCAL_VAULT_HOST_PATH=/absolute/path/to/vault)"
elif [[ "${VAULT_BACKEND}" == "pvc" ]]; then
  echo "==> Obsidian vault backend: pvc (in-cluster storage)"
  echo "    (set CLAWQL_LOCAL_K8S_VAULT_BACKEND=hostPath to use $HOME/.ClawQL mount)"
else
  echo "ERROR: CLAWQL_LOCAL_K8S_VAULT_BACKEND must be hostPath or pvc (got: ${VAULT_BACKEND})"
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl not found. Enable Kubernetes in Rancher Desktop or Docker Desktop; ensure kubectl is on PATH."
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "ERROR: helm not found. local-k8s-up installs Kyverno via Helm and requires Helm 3."
  echo "       https://helm.sh/docs/intro/install/"
  exit 1
fi

if [[ "${INSTALLER}" != "helm" && "${INSTALLER}" != "kustomize" ]]; then
  echo "ERROR: CLAWQL_LOCAL_K8S_INSTALLER must be 'helm' or 'kustomize' (got: ${INSTALLER})"
  exit 1
fi

if [[ "${CLAWQL_LOCAL_K8S_BUILD_IMAGE:-}" == "1" ]]; then
  echo "ERROR: CLAWQL_LOCAL_K8S_BUILD_IMAGE=1 is not supported."
  echo "       local-k8s-up enforces Kyverno Cosign verification for ClawQL images from GHCR only."
  exit 1
fi

if [[ "${CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE:-0}" == "1" ]]; then
  echo "ERROR: CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE=1 is not supported."
  echo "       local-k8s-up pulls signed ghcr.io/danielsmithdevelopment/clawql-{mcp,website,dashboard} (see values-docker-desktop.yaml + docker-publish workflow)."
  exit 1
fi

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

kubectl_ctx() {
  # kubectl uses --context (Helm uses --kube-context — do not mix them up).
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    kubectl --context "${KUBE_CONTEXT}" "$@"
  else
    kubectl "$@"
  fi
}

helm_ctx() {
  if [[ -n "${KUBE_CONTEXT}" ]]; then
    helm --kube-context "${KUBE_CONTEXT}" "$@"
  else
    helm "$@"
  fi
}

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/rancher-rdctl.sh"

clawql_rdctl_maybe_disable_traefik_for_istio_gateway_hostnetwork() {
  [[ "${CLAWQL_RD_AUTO_DISABLE_TRAEFIK_WITH_ISTIO:-1}" == "1" ]] || return 0
  [[ -n "${INSTALL_ISTIO}" ]] || return 0
  [[ "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" ]] || return 0
  local ctx_eff="${KUBE_CONTEXT:-}"
  if [[ -z "${ctx_eff}" ]]; then
    ctx_eff="$(kubectl config current-context 2>/dev/null || true)"
  fi
  [[ "${ctx_eff}" == rancher-desktop ]] || return 0
  local rdctl_bin
  rdctl_bin="$(clawql_find_rdctl 2>/dev/null)" || return 0
  if ! "${rdctl_bin}" list-settings 2>/dev/null | grep -Eq '"traefik"[[:space:]]*:[[:space:]]*true'; then
    return 0
  fi
  echo "==> Rancher Desktop: disabling bundled Traefik (TCP :80 conflict with ClawQL Istio ingress on localhost; automatic via rdctl)"
  "${rdctl_bin}" set --kubernetes.options.traefik=false
  echo "    Waiting for Kubernetes API after backend restart…"
  local _i
  for _i in $(seq 1 90); do
    if kubectl_ctx cluster-info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "WARN: cluster not reachable after Traefik toggle; continuing (check Rancher Desktop status)"
}

if ! kubectl_ctx cluster-info >/dev/null 2>&1; then
  echo "ERROR: kubectl cannot reach the cluster with the selected context."
  echo ""
  echo "Checklist:"
  echo "  Rancher Desktop:"
  echo "    1. Rancher Desktop is running; Preferences → Kubernetes → Enable Kubernetes is on."
  echo "    2. Wait until the cluster is ready, then: kubectl config use-context rancher-desktop"
  echo "  Docker Desktop:"
  echo "    1. Docker Desktop is running; Settings → Kubernetes → Enable Kubernetes → Apply & Restart."
  echo "    2. Then: kubectl config use-context docker-desktop"
  echo ""
  echo "If you switched products and see TLS / unknown authority errors, delete the stale context"
  echo "from ${HOME}/.kube/config or force the live one: CLAWQL_LOCAL_K8S_CONTEXT=rancher-desktop make local-k8s-up"
  echo ""
  echo "kubectl said:"
  kubectl_ctx cluster-info 2>&1 || true
  exit 1
fi

clawql_rdctl_maybe_disable_traefik_for_istio_gateway_hostnetwork

if [[ "${CLAWQL_LOCAL_K8S_TRIM_KUBE_SYSTEM_CPU_REQUESTS:-1}" == "1" ]]; then
  echo "==> kube-system: trim coredns + metrics-server CPU requests (100m → 25m; CLAWQL_LOCAL_K8S_TRIM_KUBE_SYSTEM_CPU_REQUESTS=0 to skip)"
  kubectl_ctx set resources deployment coredns -n kube-system -c coredns --requests=cpu=25m 2>/dev/null || true
  kubectl_ctx set resources deployment metrics-server -n kube-system -c metrics-server --requests=cpu=25m 2>/dev/null || true
fi

echo "==> Installing/upgrading Kyverno (chart ${KYVERNO_CHART_VERSION}; override with CLAWQL_KYVERNO_CHART_VERSION)"
echo "    Helm --wait blocks until Kyverno pods are Ready (timeout 10m). First install or cold"
echo "    Docker Desktop often spends several minutes pulling controller images — not stuck."
KYVERNO_HELM_EXTRA=()
if [[ "${KYVERNO_CRDS_MIGRATION}" != "1" ]]; then
  KYVERNO_HELM_EXTRA+=(--set crds.migration.enabled=false)
  echo "    Disabling Kyverno crds.migration hook (avoids kyverno-migrate-resources / reg.kyverno.io ErrImagePull on many networks)."
  echo "    Re-enable upstream migration Job: CLAWQL_LOCAL_K8S_KYVERNO_CRDS_MIGRATION=1 make local-k8s-up"
fi
# Single-node local: chart defaults 100m per Kyverno controller; quarter for scheduling headroom.
KYVERNO_HELM_EXTRA+=(
  --set-string admissionController.container.resources.requests.cpu=25m
  --set-string backgroundController.resources.requests.cpu=25m
  --set-string cleanupController.resources.requests.cpu=25m
  --set-string reportsController.resources.requests.cpu=25m
)
helm repo add kyverno https://kyverno.github.io/kyverno/ >/dev/null 2>&1 || true
helm repo update >/dev/null
# Single line: avoid `\` continuation bugs that surface as `--wait: command not found` (exit 127).
helm_ctx upgrade --install kyverno kyverno/kyverno --version "${KYVERNO_CHART_VERSION}" --namespace kyverno --create-namespace "${KYVERNO_HELM_EXTRA[@]}" --wait --timeout 10m

# Optional GHCR pull secret in **kyverno** so Cosign verifyImages can fetch manifests/signatures for private
# packages (or when anonymous GHCR returns DENIED). Token: CLAWQL_KYVERNO_GHCR_PULL_TOKEN or GITHUB_TOKEN / GH_TOKEN / CLAWQL_GITHUB_TOKEN.
HELM_KYVERNO_GHCR_ARGS=()
# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/kyverno-ghcr-pull-secret.sh"
if clawql_ensure_kyverno_ghcr_pull_secret; then
  _ghcr_sec="${CLAWQL_KYVERNO_GHCR_SECRET_NAME:-clawql-kyverno-ghcr-pull}"
  HELM_KYVERNO_GHCR_ARGS=(--set-json "kyverno.imageSignaturePolicy.imageRegistrySecretNames=[\"${_ghcr_sec}\"]")
  echo "    Kyverno verifyImages will use registry secret: ${_ghcr_sec} (namespace kyverno)"
fi

if [[ "${INSTALL_INGRESS_NGINX}" == "1" ]]; then
  echo "==> Installing/upgrading ingress-nginx controller"
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
  helm repo update >/dev/null
  helm_ctx upgrade --install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace --set controller.publishService.enabled=true --set-string controller.resources.requests.cpu=25m --set-string controller.resources.requests.memory=128Mi --wait --timeout 10m
elif [[ -n "${INSTALL_ISTIO}" ]] && [[ "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" ]] && [[ "${CLAWQL_LOCAL_K8S_REMOVE_STALE_INGRESS_NGINX_WITH_ISTIO:-1}" == "1" ]]; then
  # Leftover ingress-nginx still binds :80 / receives *.localhost but Helm no longer emits Ingress — nginx serves default-backend 404 ("Server: nginx").
  if helm_ctx status ingress-nginx -n ingress-nginx >/dev/null 2>&1; then
    echo "==> Uninstalling stale Helm release ingress-nginx (Istio Gateway + VirtualServices replace chart Ingress for *.localhost)"
    helm_ctx uninstall ingress-nginx -n ingress-nginx --wait --timeout 8m || true
  fi
fi

if [[ -n "${INSTALL_ISTIO}" ]]; then
  ISTIO_HEAVY_OBS="${CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS:-1}"
  echo "==> Istio (${INSTALL_ISTIO}) + observability stack (see install-istio-docker-desktop.sh)"
  CLAWQL_LOCAL_K8S_ISTIO_MODE="${INSTALL_ISTIO}" \
    CLAWQL_TARGET_NAMESPACE="${NAMESPACE}" \
    CLAWQL_LOCAL_K8S_CONTEXT="${KUBE_CONTEXT}" \
    bash "${ROOT}/scripts/kubernetes/install-istio-docker-desktop.sh"
fi

if [[ "${INSTALLER}" == "helm" ]]; then
  echo "==> helm upgrade --install ${RELEASE_NAME} (${NAMESPACE}) (wait timeout ${HELM_TIMEOUT})"
  if [[ "${CLAWQL_LOCAL_K8S_FULL_STACK}" == "0" ]]; then
    echo "    Helm --wait blocks until MCP + UI are Ready (quick stack; heavy subcharts disabled via --set)."
  else
    echo "    Helm --wait blocks until every workload in the chart is Ready (full stack)."
  fi
  echo "    If this stalls: kubectl --context \${KUBE_CONTEXT:-} get pods -n ${NAMESPACE}  (CrashLoop / Error pods block --wait)."
  echo "    Kyverno admits Cosign-signed ghcr.io/danielsmithdevelopment/clawql-{mcp,panguard-mcp-bridge,website,dashboard} in ${NAMESPACE}."
  HELM_VAULT_ARGS=()
  if [[ "${VAULT_BACKEND}" == "hostPath" ]]; then
    HELM_VAULT_ARGS+=(--set-string "vault.hostPath.path=${VAULT_HOST_PATH}")
    HELM_VAULT_ARGS+=(--set "vault.hostPath.enabled=true")
    HELM_VAULT_ARGS+=(--set "persistence.enabled=false")
  else
    HELM_VAULT_ARGS+=(--set "vault.hostPath.enabled=false")
    HELM_VAULT_ARGS+=(--set "persistence.enabled=true")
  fi

  set +e
  # set -u: empty-array expansion can trip nounset in some Bash builds; use ${arr[@]+"${arr[@]}"} guards.
  # Single line: avoid `\` continuation bugs that surface as `--wait: command not found` (exit 127).
  helm_ctx upgrade --install "${RELEASE_NAME}" "${CHART}" --namespace "${NAMESPACE}" --create-namespace -f "${VALUES_LOCAL}" "${HELM_VAULT_ARGS[@]+"${HELM_VAULT_ARGS[@]}"}" "${HELM_QUICK_SET_ARGS[@]+"${HELM_QUICK_SET_ARGS[@]}"}" "${HELM_OFFLOAD_LOCALHOST_INGRESS_ARGS[@]+"${HELM_OFFLOAD_LOCALHOST_INGRESS_ARGS[@]}"}" "${HELM_MCP_SVC_TYPE_ARGS[@]+"${HELM_MCP_SVC_TYPE_ARGS[@]}"}" "${HELM_KYVERNO_GHCR_ARGS[@]+"${HELM_KYVERNO_GHCR_ARGS[@]}"}" --wait --timeout "${HELM_TIMEOUT}"
  HELM_EXIT=$?
  set -e
  if [[ "${HELM_EXIT}" -ne 0 ]]; then
    echo ""
    echo "Helm failed. If the error mentions existing resources / invalid ownership (e.g. after"
    echo "kubectl apply or Kustomize), delete the old MCP objects and retry:"
    echo "  make local-k8s-mcp-delete && make local-k8s-up"
    echo "If admission says env value + valueFrom conflict (e.g. ONYX_BASE_URL after set-mcp-auth):"
    echo "  kubectl -n ${NAMESPACE} delete deployment/clawql-mcp-http --ignore-not-found && make local-k8s-up"
    echo ""
    echo "Kyverno / ClusterPolicy: chart uses a Helm pre-upgrade hook for the policy (same field manager as Helm)."
    echo "If you see apply conflicts on clawql-ghcr-cosign-keyless after kubectl apply, delete it once:"
    echo "  kubectl delete clusterpolicy clawql-ghcr-cosign-keyless"
    echo "If conflict is svc/clawql-mcp-http .spec.type (kubectl-patch vs Helm): delete Service once, rerun:"
    echo "  kubectl -n ${NAMESPACE} delete svc clawql-mcp-http --ignore-not-found && make local-k8s-up"
    echo "Kyverno denied GHCR (verifyImages): set a PAT in env (GITHUB_TOKEN or CLAWQL_KYVERNO_GHCR_PULL_TOKEN) and rerun so a kyverno/docker-registry secret is created, or make GHCR packages public (docs/security/image-signature-enforcement.md)."
    echo "One-shot bypass: helm upgrade --install ${RELEASE_NAME} ${CHART} -n ${NAMESPACE} -f ${VALUES_LOCAL}"
    echo "  --set-string vault.hostPath.path=... --set kyverno.imageSignaturePolicy.enabled=false"
    exit "${HELM_EXIT}"
  fi

  if [[ "${INSTALL_INGRESS_NGINX}" == "0" ]] && [[ -n "${INSTALL_ISTIO}" ]] && [[ "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" ]]; then
    echo "==> Istio VirtualServices for *.localhost (nginx Ingress objects disabled in Helm)"
    sed "s/__TARGET_NAMESPACE__/${NAMESPACE}/g" "${ROOT}/docker/istio/docker-desktop/clawql-localhost-vs-core.yaml" | kubectl_ctx apply -f -
    sed "s/__TARGET_NAMESPACE__/${NAMESPACE}/g" "${ROOT}/docker/istio/docker-desktop/clawql-localhost-vs-dashboard.yaml" | kubectl_ctx apply -f -
    if [[ "${CLAWQL_LOCAL_K8S_FULL_STACK}" == "1" ]]; then
      sed "s/__TARGET_NAMESPACE__/${NAMESPACE}/g" "${ROOT}/docker/istio/docker-desktop/clawql-localhost-vs-providers.yaml" | kubectl_ctx apply -f -
    fi
  fi

else
  if [[ "${VAULT_BACKEND}" != "hostPath" ]]; then
    echo "ERROR: CLAWQL_LOCAL_K8S_VAULT_BACKEND=pvc is supported with Helm installer only."
    echo "       Use default Helm installer or set CLAWQL_LOCAL_K8S_INSTALLER=helm."
    exit 1
  fi
  # Kustomize: JSON patch for hostPath vault (same as before Helm was default).
  PATCH_FILE="${KUSTOMIZE_OVERLAY}/patch-mcp-vault-hostpath.json"
  export VAULT_HOST_PATH
  python3 <<'PY' >"${PATCH_FILE}"
import json, os

path = os.environ["VAULT_HOST_PATH"]
patch = [
    {
        "op": "replace",
        "path": "/spec/template/spec/volumes/0",
        "value": {
            "name": "obsidian-vault",
            "hostPath": {"path": path, "type": "DirectoryOrCreate"},
        },
    }
]
print(json.dumps(patch))
PY

  echo "==> Applying Kustomize overlay ${KUSTOMIZE_OVERLAY}"
  kubectl_ctx apply -k "${KUSTOMIZE_OVERLAY}"

  echo "==> Applying Kyverno ClusterPolicy (from Helm chart template; release ${RELEASE_NAME})"
  helm_ctx template "${RELEASE_NAME}" "${CHART}" \
    -f "${VALUES_LOCAL}" \
    --set-string "vault.hostPath.path=${VAULT_HOST_PATH}" \
    --namespace "${NAMESPACE}" \
    --show-only templates/kyverno-clusterpolicy-cosign.yaml | kubectl_ctx apply -f -
fi

# MCP Service type (ClusterIP vs LoadBalancer) is set via Helm HELM_MCP_SVC_TYPE_ARGS — no post-upgrade kubectl patch.

echo "==> Rollout status"
kubectl_ctx -n "${NAMESPACE}" rollout status deployment/clawql-mcp-http --timeout=300s

echo ""
echo "==> Services"
kubectl_ctx -n "${NAMESPACE}" get svc

echo ""
if [[ -n "${INSTALL_ISTIO}" && "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" && "${CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP:-0}" == "1" ]]; then
  echo "svc/clawql-mcp-http → ClusterIP (host traffic: Istio svc/clawql-mcp-ingress — LoadBalancer→localhost on docker/rancher kube contexts, else hostNetwork :80 → VirtualService → deployment/clawql-mcp-http:8080)."
else
  echo "MCP HTTP (nginx Ingress or direct Service LB when Istio CLUSTERIP posture is off — see README): http://clawql-mcp.localhost/mcp"
  echo ""
  _mcp_lb_ip="$(kubectl_ctx get svc -n "${NAMESPACE}" clawql-mcp-http -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  if [[ -n "${_mcp_lb_ip}" ]]; then
    echo "Direct Service (Diagnostics): http://${_mcp_lb_ip}:8080/mcp"
    echo ""
  fi
fi
echo "Bundled dashboard + docs + provider UIs: http://clawql.localhost  http://docs.localhost  http://onyx.localhost  … — same clawql-mcp-ingress Envoy :80 when Istio gateway + VirtualServices apply (ingress-nginx auto-skipped)."
if [[ -n "${INSTALL_ISTIO}" ]] && [[ "${INSTALL_ISTIO}" == "ambient" ]]; then
  echo ""
  echo "Ambient tip: rollout workloads once if Envoy sidecars linger after upgrades (Ingress/502): kubectl rollout restart deployment -n ${NAMESPACE}"
fi
if [[ -n "${INSTALL_ISTIO}" ]]; then
  echo ""
  echo "Istio (${INSTALL_ISTIO}) north-south (defaults): Gateway + Envoy on :80 / :50051 (LoadBalancer localhost on docker/rancher kube contexts; hostNetwork elsewhere unless overridden)"
  echo "  MCP URLs: http://127.0.0.1/mcp (Cursor default in .cursor/mcp.json.example)   http://localhost/mcp   http://clawql-mcp.localhost/mcp"
  echo "Health: curl -s http://localhost/healthz"
  echo "  gRPC: localhost:50051"
  echo "Streamable HTTP smoke: bash scripts/kubernetes/smoke-mcp-http-istio-gateway.sh"
  echo "gRPC smoke:         bash scripts/kubernetes/smoke-grpcurl-istio-gateway-mcp.sh"
  echo "Control plane:     kubectl get pods -n istio-system"
  echo "Observability (port-forward as needed):"
  echo "  Kiali:      kubectl port-forward svc/kiali 20001:20001 -n istio-system"
  echo "  Prometheus: kubectl port-forward svc/prometheus 9090:9090 -n istio-system"
  if [[ "${ISTIO_HEAVY_OBS}" == "1" ]]; then
    echo "  Grafana:    kubectl port-forward svc/grafana 3000:3000 -n istio-system"
    echo "  Tempo:      kubectl port-forward svc/clawql-tempo 3200:3200 -n istio-system  (Grafana datasource)"
    echo "  MCP OTLP:   OTEL_EXPORTER_OTLP_ENDPOINT=http://clawql-otel-collector.istio-system.svc:4318/v1/traces (set CLAWQL_ENABLE_OTEL_TRACING=1)"
  fi
fi
echo ""
if [[ -n "${INSTALL_ISTIO}" && "${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}" == "1" && "${CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP:-0}" == "1" ]]; then
  echo "${HOME}/.cursor/mcp.json: prefer \"url\": \"http://127.0.0.1/mcp\" (Docker Desktop macOS) or \"http://localhost/mcp\" / \"http://clawql-mcp.localhost/mcp\" — see repo .cursor/mcp.json.example. svc/clawql-mcp-http is ClusterIP — do not rely on a raw :8080 LoadBalancer URL."
  echo "To expose direct MCP LoadBalancer :8080 again (bypass gateway): CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP=0 make local-k8s-up"
else
  echo "${HOME}/.cursor/mcp.json: \"url\": \"http://clawql-mcp.localhost/mcp\" (Ingress), or direct LB :8080 / Istio gateway URL when CLUSTERIP=0 (see messages above)."
fi
