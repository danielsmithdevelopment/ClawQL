#!/usr/bin/env bash
set -euo pipefail

# Install Istio (ambient or sidecar) on local desktop Kubernetes (Docker Desktop or Rancher Desktop) via Helm, optional
# observability addons (upstream Istio samples: Prometheus, Kiali, Grafana) plus Helm Grafana Tempo
# and a minimal in-repo OpenTelemetry Collector forwarding app OTLP to Tempo, then label the
# ClawQL namespace for the mesh.
#
# Intended caller: scripts/kubernetes/local-k8s-docker-desktop.sh, or manual:
#   CLAWQL_LOCAL_K8S_ISTIO_MODE=ambient bash scripts/kubernetes/install-istio-docker-desktop.sh
#
# Env:
#   CLAWQL_LOCAL_K8S_ISTIO_MODE — required: ambient | sidecar
#   CLAWQL_ISTIO_VERSION — Helm chart version (default 1.29.2)
#   CLAWQL_TARGET_NAMESPACE — namespace to enroll + optional STRICT policy (default clawql)
#   CLAWQL_ISTIO_INSTALL_KIALI — 1 installs samples/addons prometheus + kiali (default 1)
#   CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS — when 1 (default), also grafana + Helm tempo
#     + docker/istio/docker-desktop/otel-collector.yaml (set 0 on tight Docker Desktop RAM)
#   CLAWQL_ISTIO_INSTALL_LOKI_TEMPO — when 1 (default), also Helm grafana/loki in istio-system
#     (single-binary lab sizing; set 0 to skip Loki only — Tempo stays). Requires HEAVY_OBSERVABILITY_ADDONS=1.
#   CLAWQL_LOKI_CHART_VERSION — Helm chart version for grafana/loki (default 6.55.0)
#   CLAWQL_TEMPO_CHART_VERSION — Helm chart version for grafana/tempo (default 1.24.4)
#   CLAWQL_ISTIO_APPLY_STRICT_MTLS — 1 applies PeerAuthentication STRICT in target NS (default 1)
#   CLAWQL_ISTIO_GATEWAY_HOST_NETWORK — empty/unset = auto: **0** on kube contexts **docker-desktop** /
#     **docker-for-desktop** / **rancher-desktop** (VM-based node: hostNetwork binds inside the VM, so host browsers
#     see connection refused on 127.0.0.1:80 — use **Service LoadBalancer → localhost** like ingress-nginx); **1** on
#     other contexts (real node: hostNetwork + ClusterIP). Set **0** or **1** explicitly to override auto.
#   CLAWQL_ISTIO_MESH_INGRESS_NGINX — 1 enrolls namespace ingress-nginx in the mesh + restarts the
#     controller so Ingress → clawql uses mesh mTLS under STRICT (default 1; set 0 if ingress ns missing)
#   CLAWQL_ISTIO_INSTALL_GATEWAY_API_CRDS — for ambient, install Gateway API experimental CRDs if missing (default 1)
#   CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY — 1 installs istio/gateway (clawql-mcp-ingress) + Istio Gateway +
#     VirtualService so MCP uses mesh north-south on :80 / :50051 (default 1)
#   CLAWQL_ISTIO_INSTALL_EGRESS_ALLOWLIST — 1 applies MCP provider egress policy (#275): default installs
#     istio/gateway (**istio-egressgateway**) + full TLS passthrough allowlist for sidecar or ambient (values
#     match CLAWQL_LOCAL_K8S_ISTIO_MODE).
#   CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE — full (default) | serviceentries — **serviceentries** skips the egress
#     gateway Helm release and applies clawql-mcp-egress-serviceentries-only.yaml only (REGISTRY_ONLY baseline).
#   CLAWQL_ISTIO_EGRESS_GATEWAY_NAMESPACE — namespace for istio-egressgateway (default istio-system)
#   CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP — applied by local-k8s-docker-desktop.sh after Helm (not this
#     script): when 1 with gateway on, patches svc/clawql-mcp-http to ClusterIP (default 0 in local-k8s-up)
#   CLAWQL_LOCAL_K8S_CONTEXT — optional; force kubectl context (see scripts/kubernetes/lib/select-local-k8s-context.sh)
#   CLAWQL_SKIP_WAIT_FOR_KYVERNO_ENDPOINTS — set to 1 to skip wait/restart gate (Kyverno webhook errors mid-upgrade otherwise)
#   CLAWQL_SKIP_RANCHER_LIMA_MOUNT_RSHARED — set to 1 to skip automatic rdctl mount --make-rshared / before istio-cni (Rancher only)
#   CLAWQL_ISTIO_LOCAL_COMPACT_RESOURCES — when 1 (default), lowers istiod / istio-cni / ztunnel CPU requests so
#     ambient + ClawQL often fits a single ~4 CPU node (Rancher / Docker Desktop). Set 0 for upstream chart defaults.
#     Also sets istiod rollingUpdate maxSurge=0 / maxUnavailable=1 so upgrades never need two pilot pods at once.
#   CLAWQL_ISTIOD_CPU_REQUEST / CLAWQL_ISTIOD_MEMORY_REQUEST — override compact istiod (pilot) requests
#     (default memory 512Mi when compact; pilot idle RSS is lower but XDS spikes need headroom — override if OOM)
#   CLAWQL_ISTIO_CNI_CPU_REQUEST / CLAWQL_ZTUNNEL_CPU_REQUEST / CLAWQL_ZTUNNEL_MEMORY_REQUEST — override compact ambient dataplane

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${CLAWQL_LOCAL_K8S_ISTIO_MODE:-}"
VER="${CLAWQL_ISTIO_VERSION:-1.29.2}"
TARGET_NS="${CLAWQL_TARGET_NAMESPACE:-clawql}"
INSTALL_KIALI="${CLAWQL_ISTIO_INSTALL_KIALI:-1}"
# Prometheus + Kiali are relatively light; Grafana + Tempo + OTel collector are heavier on RAM/CPU.
HEAVY_OBS="${CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS:-1}"
LOKI_TEMPO="${CLAWQL_ISTIO_INSTALL_LOKI_TEMPO:-1}"
LOKI_CHART_VER="${CLAWQL_LOKI_CHART_VERSION:-6.55.0}"
TEMPO_CHART_VER="${CLAWQL_TEMPO_CHART_VERSION:-1.24.4}"
STRICT="${CLAWQL_ISTIO_APPLY_STRICT_MTLS:-1}"
MESH_INGRESS="${CLAWQL_ISTIO_MESH_INGRESS_NGINX:-1}"
GATEWAY_API="${CLAWQL_ISTIO_INSTALL_GATEWAY_API_CRDS:-1}"
INGRESS_GW_INSTALL="${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}"
EGRESS_ALLOWLIST="${CLAWQL_ISTIO_INSTALL_EGRESS_ALLOWLIST:-0}"
EGRESS_ALLOWLIST_MODE="${CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE:-full}"
EGRESS_GW_NS="${CLAWQL_ISTIO_EGRESS_GATEWAY_NAMESPACE:-istio-system}"
INGRESS_GW_NS=istio-ingress
INGRESS_GW_RELEASE=clawql-mcp-ingress
ISTIO_NS=istio-system
HELM_WAIT_TIMEOUT="${CLAWQL_ISTIO_HELM_TIMEOUT:-15m}"
ISTIO_COMPACT="${CLAWQL_ISTIO_LOCAL_COMPACT_RESOURCES:-1}"

# Optional extra Helm --set flags (local single-node: default compact requests so istiod schedules).
istiod_helm_extra=()
if [[ "${ISTIO_COMPACT}" == "1" ]]; then
  PC="${CLAWQL_ISTIOD_CPU_REQUEST:-25m}"
  PM="${CLAWQL_ISTIOD_MEMORY_REQUEST:-512Mi}"
  istiod_helm_extra+=(--set "pilot.resources.requests.cpu=${PC}" --set "pilot.resources.requests.memory=${PM}")
  # Default chart uses maxSurge 100% → two istiod pods briefly during helm upgrade; tight single-node CPU cannot schedule the second.
  istiod_helm_extra+=(--set rollingMaxSurge=0 --set rollingMaxUnavailable=1)
fi
cni_helm_extra=()
ztunnel_helm_extra=()
if [[ "${MODE}" == "ambient" && "${ISTIO_COMPACT}" == "1" ]]; then
  CC="${CLAWQL_ISTIO_CNI_CPU_REQUEST:-50m}"
  ZC="${CLAWQL_ZTUNNEL_CPU_REQUEST:-100m}"
  ZM="${CLAWQL_ZTUNNEL_MEMORY_REQUEST:-256Mi}"
  cni_helm_extra+=(--set "resources.requests.cpu=${CC}")
  ztunnel_helm_extra+=(--set "resources.requests.cpu=${ZC}" --set "resources.requests.memory=${ZM}")
fi

if [[ "${MODE}" != "ambient" && "${MODE}" != "sidecar" ]]; then
  echo "ERROR: Set CLAWQL_LOCAL_K8S_ISTIO_MODE=ambient or CLAWQL_LOCAL_K8S_ISTIO_MODE=sidecar (got: ${MODE})"
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo "ERROR: kubectl not found."
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "ERROR: helm not found."
  exit 1
fi

# shellcheck disable=SC1091
source "${ROOT}/scripts/kubernetes/lib/select-local-k8s-context.sh"
clawql_select_local_k8s_context

kubectl_ctx() {
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

# Docker Desktop / Rancher Desktop: Kubernetes "node" is a Linux VM — pod hostNetwork does not publish :80 to macOS/Win localhost.
clawql_kube_context_is_desktop_vm() {
  local ctx="${KUBE_CONTEXT:-}"
  if [[ -z "${ctx}" ]]; then
    ctx="$(kubectl config current-context 2>/dev/null || true)"
  fi
  case "${ctx}" in
    rancher-desktop | docker-desktop | docker-for-desktop) return 0 ;;
    *) return 1 ;;
  esac
}

if ! kubectl_ctx cluster-info >/dev/null 2>&1; then
  echo "ERROR: kubectl cannot reach the cluster."
  exit 1
fi

echo "==> Istio mode: ${MODE} (chart version ${VER}; override CLAWQL_ISTIO_VERSION)"
echo "    Target workload namespace: ${TARGET_NS}"

helm repo add istio https://istio-release.storage.googleapis.com/charts >/dev/null 2>&1 || true
helm repo update >/dev/null

if [[ "${MODE}" == "ambient" ]] && [[ "${GATEWAY_API}" == "1" ]]; then
  if ! kubectl_ctx get crd gateways.gateway.networking.k8s.io &>/dev/null; then
    echo "==> Installing Kubernetes Gateway API CRDs (experimental bundle; Istio ambient docs)"
    kubectl_ctx apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/experimental-install.yaml
  fi
fi

# Mutating webhooks post to kyverno-svc; if Endpoints are empty (controllers down after restart), istiod Helm fails:
# "no endpoints available for service kyverno-svc".
wait_for_kyverno_svc_endpoints_if_installed() {
  if [[ "${CLAWQL_SKIP_WAIT_FOR_KYVERNO_ENDPOINTS:-0}" == "1" ]]; then
    echo "WARN: skipping Kyverno endpoints gate (CLAWQL_SKIP_WAIT_FOR_KYVERNO_ENDPOINTS=1)"
    return 0
  fi
  local ns=kyverno
  local svc=kyverno-svc
  if ! kubectl_ctx get svc -n "${ns}" "${svc}" &>/dev/null; then
    return 0
  fi
  echo "==> Ensuring Kyverno (${ns}/${svc}) has Endpoints before Istio Helm (mutate webhook)"
  local ip
  ip="$(kubectl_ctx get endpoints -n "${ns}" "${svc}" -o jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null || true)"
  if [[ -z "${ip}" ]]; then
    echo "    No endpoints yet — restarting kyverno Deployments once, then waiting…"
    kubectl_ctx rollout restart deployment -n "${ns}" 2>/dev/null || true
  fi
  local deadline=$((SECONDS + 300))
  while [[ "${SECONDS}" -lt "${deadline}" ]]; do
    ip="$(kubectl_ctx get endpoints -n "${ns}" "${svc}" -o jsonpath='{.subsets[0].addresses[0].ip}' 2>/dev/null || true)"
    if [[ -n "${ip}" ]]; then
      echo "    Kyverno endpoints OK."
      return 0
    fi
    sleep 3
  done
  echo "ERROR: Kyverno ${ns}/${svc} still has no Endpoints after 300s."
  echo "       kubectl_ctx get pods -n ${ns}"
  echo "       kubectl_ctx describe endpoints -n ${ns} ${svc}"
  exit 1
}

wait_for_kyverno_svc_endpoints_if_installed

echo "==> Helm: istio/base"
helm_ctx upgrade --install istio-base istio/base --namespace "${ISTIO_NS}" --create-namespace --version "${VER}" --wait --timeout "${HELM_WAIT_TIMEOUT}"

if [[ "${MODE}" == "ambient" ]]; then
  echo "==> Helm: istiod (profile=ambient)"
  if [[ "${ISTIO_COMPACT}" == "1" ]]; then
    echo "    (compact CPU/memory requests: CLAWQL_ISTIO_LOCAL_COMPACT_RESOURCES=0 for chart defaults)"
  fi
  # Single line: avoid line-continuation bugs where a missing '\' makes `--wait` run as a separate command (exit 127).
  helm_ctx upgrade --install istiod istio/istiod --namespace "${ISTIO_NS}" --version "${VER}" --set profile=ambient "${istiod_helm_extra[@]}" --wait --timeout "${HELM_WAIT_TIMEOUT}"

  if [[ "${KUBE_CONTEXT:-}" == "rancher-desktop" ]] && [[ "${CLAWQL_SKIP_RANCHER_LIMA_MOUNT_RSHARED:-0}" != "1" ]]; then
    # shellcheck disable=SC1091
    source "${ROOT}/scripts/kubernetes/lib/rancher-rdctl.sh"
    if clawql_rancher_lima_mount_make_rshared; then
      echo "    Restarting istio-cni-node Pods so install-cni retries after mount fix…"
      kubectl_ctx delete pod -n "${ISTIO_NS}" -l k8s-app=istio-cni-node --ignore-not-found >/dev/null 2>&1 || true
    else
      echo "ERROR: Could not run Rancher Lima fix (mount --make-rshared /). istio-cni will fail until this succeeds."
      echo "       Install/find rdctl — it's bundled with Rancher Desktop, often:"
      echo "         export PATH=\"/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/bin:\$PATH\""
      echo "       Or: export RDCTL_PATH=/absolute/path/to/rdctl"
      echo "       Manual: rdctl shell -- sh -c 'sudo mount --make-rshared /'"
      echo "       Skip (broken ambient): CLAWQL_SKIP_RANCHER_LIMA_MOUNT_RSHARED=1 CLAWQL_LOCAL_K8S_ISTIO=sidecar …"
      exit 1
    fi
  elif [[ "${KUBE_CONTEXT:-}" == "rancher-desktop" ]]; then
    echo "WARN: CLAWQL_SKIP_RANCHER_LIMA_MOUNT_RSHARED=1 — if istio-cni fails with netns/rshared, fix Lima mount manually."
  fi

  echo "==> Helm: istio-cni (profile=ambient, namespace ${ISTIO_NS})"
  helm_ctx upgrade --install istio-cni istio/cni --namespace "${ISTIO_NS}" --version "${VER}" --set profile=ambient "${cni_helm_extra[@]}" --wait --timeout "${HELM_WAIT_TIMEOUT}"

  echo "==> Helm: ztunnel"
  helm_ctx upgrade --install ztunnel istio/ztunnel --namespace "${ISTIO_NS}" --version "${VER}" "${ztunnel_helm_extra[@]}" --wait --timeout "${HELM_WAIT_TIMEOUT}"
else
  echo "==> Helm: istiod (default / sidecar dataplane)"
  if [[ "${ISTIO_COMPACT}" == "1" ]]; then
    echo "    (compact pilot requests: CLAWQL_ISTIO_LOCAL_COMPACT_RESOURCES=0 for chart defaults)"
  fi
  helm_ctx upgrade --install istiod istio/istiod --namespace "${ISTIO_NS}" --version "${VER}" "${istiod_helm_extra[@]}" --wait --timeout "${HELM_WAIT_TIMEOUT}"
fi

if [[ "${INGRESS_GW_INSTALL}" == "1" ]]; then
  EFFECTIVE_GATEWAY_HOST_NETWORK="${CLAWQL_ISTIO_GATEWAY_HOST_NETWORK:-}"
  if [[ -z "${EFFECTIVE_GATEWAY_HOST_NETWORK}" ]]; then
    if clawql_kube_context_is_desktop_vm; then
      EFFECTIVE_GATEWAY_HOST_NETWORK=0
      echo "==> Istio ingress gateway: desktop Kubernetes VM (${KUBE_CONTEXT:-$(kubectl config current-context 2>/dev/null || echo '?')}) — Service type LoadBalancer (hostNetwork does not reach the host's 127.0.0.1). Override: CLAWQL_ISTIO_GATEWAY_HOST_NETWORK=1"
    else
      EFFECTIVE_GATEWAY_HOST_NETWORK=1
    fi
  fi
  GW_HELM_SERVICE_EXTRA=()
  if [[ "${EFFECTIVE_GATEWAY_HOST_NETWORK}" != "1" ]]; then
    GW_HELM_SERVICE_EXTRA=(--set service.type=LoadBalancer)
  fi

  echo "==> Helm: istio/gateway (${INGRESS_GW_RELEASE} in ${INGRESS_GW_NS}) + Istio Gateway + VirtualService"
  kubectl_ctx create namespace "${TARGET_NS}" --dry-run=client -o yaml | kubectl_ctx apply -f -
  kubectl_ctx create namespace "${INGRESS_GW_NS}" --dry-run=client -o yaml | kubectl_ctx apply -f -
  if [[ "${MODE}" == "ambient" ]]; then
    kubectl_ctx label namespace "${INGRESS_GW_NS}" istio.io/dataplane-mode=ambient --overwrite
    kubectl_ctx label namespace "${INGRESS_GW_NS}" istio-injection- 2>/dev/null || true
  else
    kubectl_ctx label namespace "${INGRESS_GW_NS}" istio-injection=enabled --overwrite
    kubectl_ctx label namespace "${INGRESS_GW_NS}" istio.io/dataplane-mode- 2>/dev/null || true
  fi
  GATEWAY_VALUES="${ROOT}/docker/istio/docker-desktop/istio-mcp-ingress-gateway-values-${MODE}.yaml"
  helm_ctx upgrade --install "${INGRESS_GW_RELEASE}" istio/gateway --namespace "${INGRESS_GW_NS}" --version "${VER}" -f "${GATEWAY_VALUES}" "${GW_HELM_SERVICE_EXTRA[@]}" --wait --timeout "${HELM_WAIT_TIMEOUT}"
  kubectl_ctx -n "${INGRESS_GW_NS}" rollout status "deployment/${INGRESS_GW_RELEASE}" --timeout=300s
  if [[ "${EFFECTIVE_GATEWAY_HOST_NETWORK}" == "1" ]]; then
    echo "==> Patch deployment/${INGRESS_GW_RELEASE} (hostNetwork) so Envoy listens on the node stack for TCP :80 and :50051 (no kubectl port-forward / NodePort)."
    kubectl_ctx patch deployment "${INGRESS_GW_RELEASE}" -n "${INGRESS_GW_NS}" -p '{"spec":{"template":{"spec":{"hostNetwork":true,"dnsPolicy":"ClusterFirstWithHostNet"}}}}' --type=merge || {
      echo "WARN: hostNetwork merge patch failed — check permissions or conflicting listeners on node :80 (Rancher Traefik?)."
    }
    kubectl_ctx -n "${INGRESS_GW_NS}" rollout status "deployment/${INGRESS_GW_RELEASE}" --timeout=300s
  else
    echo "    SKIPPED hostNetwork (using LoadBalancer Service — Docker Desktop / Rancher map localhost:80 to this Service)."
  fi
  sed "s/__TARGET_NAMESPACE__/${TARGET_NS}/g" "${ROOT}/docker/istio/docker-desktop/clawql-mcp-gateway-and-virtualservice.yaml" | kubectl_ctx apply -f -
  if [[ "${EFFECTIVE_GATEWAY_HOST_NETWORK}" == "1" ]]; then
    echo "    North-south: hostNetwork :80 / :50051 on the node + ClusterIP Service (no port-forward)."
  else
    echo "    North-south: Service LoadBalancer (not hostNetwork). On Docker/Rancher Desktop the EXTERNAL-IP is usually localhost — kubectl -n ${INGRESS_GW_NS} get svc ${INGRESS_GW_RELEASE}"
  fi
  echo "    Host MCP (Ingress-shaped hostname): http://clawql-mcp.localhost/mcp"
  echo "    gRPC (plaintext to gateway workload port): localhost:50051 · svc/${INGRESS_GW_RELEASE} (cluster east-west via Service)"
fi

if [[ "${EGRESS_ALLOWLIST}" == "1" ]]; then
  kubectl_ctx create namespace "${TARGET_NS}" --dry-run=client -o yaml | kubectl_ctx apply -f -
  if [[ "${EGRESS_ALLOWLIST_MODE}" == "serviceentries" ]]; then
    echo "==> MCP provider egress: ServiceEntry-only allowlist (#275, CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE=serviceentries)"
    sed \
      -e "s/__TARGET_NAMESPACE__/${TARGET_NS}/g" \
      "${ROOT}/docker/istio/docker-desktop/clawql-mcp-egress-serviceentries-only.yaml" | kubectl_ctx apply -f -
    echo "    ServiceEntry allowlist applied — set istiod REGISTRY_ONLY to fail closed; add istio-egressgateway + full YAML for centralized egress (see docs/deployment/helm.md)."
  else
    EGRESS_GW_VALUES="${ROOT}/docker/istio/docker-desktop/istio-clawql-egress-gateway-values-${MODE}.yaml"
    echo "==> Helm: istio/gateway (istio-egressgateway in ${EGRESS_GW_NS}, mode=${MODE}) + MCP provider egress allowlist (#275)"
    kubectl_ctx create namespace "${EGRESS_GW_NS}" --dry-run=client -o yaml | kubectl_ctx apply -f -
    helm_ctx upgrade --install istio-egressgateway istio/gateway --namespace "${EGRESS_GW_NS}" --version "${VER}" -f "${EGRESS_GW_VALUES}" --wait --timeout "${HELM_WAIT_TIMEOUT}"
    kubectl_ctx -n "${EGRESS_GW_NS}" rollout status "deployment/istio-egressgateway" --timeout=300s
    sed \
      -e "s/__TARGET_NAMESPACE__/${TARGET_NS}/g" \
      -e "s/__EGRESS_GATEWAY_NAMESPACE__/${EGRESS_GW_NS}/g" \
      "${ROOT}/docker/istio/docker-desktop/clawql-mcp-egress-allowlist.yaml" | kubectl_ctx apply -f -
    echo "    Egress allowlist applied — trim hosts to providers you use; optional istiod REGISTRY_ONLY — docs/deployment/helm.md (#275)."
  fi
fi

if [[ "${INSTALL_KIALI}" == "1" ]]; then
  echo "==> Addons: Prometheus + Kiali (Istio ${VER} samples; local-only sizing)"
  ADDON_BASE="https://raw.githubusercontent.com/istio/istio/${VER}/samples/addons"
  kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/prometheus.yaml"
  kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/kiali.yaml"
  if [[ "${HEAVY_OBS}" == "1" ]]; then
    echo "==> Addons: Grafana (Istio sample; set CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0 to skip)"
    kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/grafana.yaml"
    echo "==> Helm repo: grafana (Tempo chart; Loki when CLAWQL_ISTIO_INSTALL_LOKI_TEMPO=1)"
    helm repo add grafana https://grafana.github.io/helm-charts >/dev/null 2>&1 || true
    helm repo update grafana >/dev/null
    echo "==> Helm: Grafana Tempo (single binary; chart ${TEMPO_CHART_VER})"
    helm_ctx upgrade --install clawql-tempo grafana/tempo --namespace "${ISTIO_NS}" --version "${TEMPO_CHART_VER}" -f "${ROOT}/docker/istio/docker-desktop/tempo-values-docker-desktop.yaml" --wait --timeout "${HELM_WAIT_TIMEOUT}"
    if [[ "${LOKI_TEMPO}" == "1" ]]; then
      echo "==> Helm: Grafana Loki (single binary; chart ${LOKI_CHART_VER})"
      helm_ctx upgrade --install clawql-loki grafana/loki --namespace "${ISTIO_NS}" --version "${LOKI_CHART_VER}" -f "${ROOT}/docker/istio/docker-desktop/loki-values-docker-desktop.yaml" --wait --timeout "${HELM_WAIT_TIMEOUT}"
    else
      echo "==> Skipping Grafana Loki (CLAWQL_ISTIO_INSTALL_LOKI_TEMPO=0)"
    fi
    echo "==> ClawQL OTel Collector → Tempo (OTLP)"
    kubectl_ctx apply -f "${ROOT}/docker/istio/docker-desktop/otel-collector.yaml"
    kubectl_ctx rollout restart deployment/clawql-otel-collector -n "${ISTIO_NS}" >/dev/null 2>&1 || true
  else
    echo "==> Skipping Grafana, Tempo, Loki, OTel collector (CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0)"
  fi
  echo "    Port-forwards (istio-system):"
  echo "      Kiali:      kubectl port-forward svc/kiali 20001:20001 -n ${ISTIO_NS}"
  echo "      Prometheus: kubectl port-forward svc/prometheus 9090:9090 -n ${ISTIO_NS}"
  if [[ "${HEAVY_OBS}" == "1" ]]; then
    echo "      Grafana:    kubectl port-forward svc/grafana 3000:3000 -n ${ISTIO_NS}"
    echo "      Tempo HTTP: kubectl port-forward svc/clawql-tempo 3200:3200 -n ${ISTIO_NS}  (Grafana Explore traces)"
    echo "      MCP OTLP:   OTEL_EXPORTER_OTLP_ENDPOINT=http://clawql-otel-collector.${ISTIO_NS}.svc:4318/v1/traces"
    if [[ "${LOKI_TEMPO}" == "1" ]]; then
      echo "      Loki API:   kubectl port-forward svc/clawql-loki 3100:3100 -n ${ISTIO_NS}  (push: /loki/api/v1/push)"
      echo "      ClawQL→Loki: CLAWQL_LOKI_PUSH_URL=http://clawql-loki.${ISTIO_NS}.svc.cluster.local:3100/loki/api/v1/push"
    fi
  else
    echo "      (Grafana / Tempo / OTel collector not installed — enable HEAVY_OBSERVABILITY_ADDONS)"
  fi
fi

echo "==> Ensure namespace ${TARGET_NS} exists (Helm may still --create-namespace later)"
kubectl_ctx create namespace "${TARGET_NS}" --dry-run=client -o yaml | kubectl_ctx apply -f -

if [[ "${MODE}" == "ambient" ]]; then
  kubectl_ctx label namespace "${TARGET_NS}" istio.io/dataplane-mode=ambient --overwrite
  kubectl_ctx label namespace "${TARGET_NS}" istio-injection- 2>/dev/null || true
else
  kubectl_ctx label namespace "${TARGET_NS}" istio-injection=enabled --overwrite
  kubectl_ctx label namespace "${TARGET_NS}" istio.io/dataplane-mode- 2>/dev/null || true
fi

if [[ "${MESH_INGRESS}" == "1" ]] && kubectl_ctx get ns ingress-nginx &>/dev/null; then
  echo "==> Enroll ingress-nginx in Istio ${MODE} (Ingress → ${TARGET_NS} uses mesh mTLS)"
  if [[ "${MODE}" == "ambient" ]]; then
    kubectl_ctx label namespace ingress-nginx istio.io/dataplane-mode=ambient --overwrite
    kubectl_ctx label namespace ingress-nginx istio-injection- 2>/dev/null || true
  else
    kubectl_ctx label namespace ingress-nginx istio-injection=enabled --overwrite
    kubectl_ctx label namespace ingress-nginx istio.io/dataplane-mode- 2>/dev/null || true
  fi
  if kubectl_ctx -n ingress-nginx get deploy ingress-nginx-controller &>/dev/null; then
    kubectl_ctx -n ingress-nginx rollout restart deployment/ingress-nginx-controller
    kubectl_ctx -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=300s
  else
    echo "WARN: ingress-nginx-controller Deployment not found; skip rollout restart (custom ingress chart?)"
  fi
elif [[ "${MESH_INGRESS}" == "1" ]]; then
  echo "WARN: namespace ingress-nginx not found; set CLAWQL_ISTIO_MESH_INGRESS_NGINX=0 or install ingress first"
fi

if [[ "${STRICT}" == "1" ]]; then
  echo "==> Applying PeerAuthentication STRICT in ${TARGET_NS} (mesh mTLS required for pod traffic)"
  kubectl_ctx apply -f - <<EOF
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: namespace-east-west-mtls-strict
  namespace: ${TARGET_NS}
spec:
  mtls:
    mode: STRICT
EOF
else
  echo "==> Skipping namespace STRICT PeerAuthentication (CLAWQL_ISTIO_APPLY_STRICT_MTLS=0)"
  echo "    Workloads still negotiate mesh TLS where both peers are in the mesh; mode is not forced STRICT."
fi

echo "==> Istio install finished (${MODE})."
if [[ "${MODE}" == "ambient" ]]; then
  echo "    Ambient: workloads in ${TARGET_NS} use ztunnel when pods are recreated without sidecars."
  echo "           If Ingress returns 502 to *.localhost backends, rollout deployments once:"
  echo "             kubectl rollout restart deployment -n ${TARGET_NS}"
fi
kubectl_ctx get pods -n "${ISTIO_NS}" -o wide

if [[ "${STRICT}" == "1" ]]; then
  echo ""
  echo "STRICT mTLS is enabled in ${TARGET_NS}: all pod traffic must use mesh identity."
  echo "Ingress → ${TARGET_NS} is meshed when ingress-nginx is enrolled (see CLAWQL_ISTIO_MESH_INGRESS_NGINX)."
  if [[ "${INGRESS_GW_INSTALL}" == "1" ]]; then
    echo "MCP via Istio Gateway: http://localhost/mcp (port 80) and gRPC :50051 on svc/${INGRESS_GW_RELEASE} in ${INGRESS_GW_NS}."
  fi
fi
