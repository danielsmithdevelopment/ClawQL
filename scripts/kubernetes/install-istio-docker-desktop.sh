#!/usr/bin/env bash
set -euo pipefail

# Install Istio (ambient or sidecar) on Docker Desktop Kubernetes via Helm, optional
# observability addons (upstream Istio samples: Prometheus, Kiali, Grafana, Jaeger) plus a
# minimal in-repo OpenTelemetry Collector forwarding app OTLP to Jaeger, then label the
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
#   CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS — when 1 (default), also grafana + jaeger
#     + docker/istio/docker-desktop/otel-collector.yaml (set 0 on tight Docker Desktop RAM)
#   CLAWQL_ISTIO_APPLY_STRICT_MTLS — 1 applies PeerAuthentication STRICT in target NS (default 1)
#   CLAWQL_ISTIO_MESH_INGRESS_NGINX — 1 enrolls namespace ingress-nginx in the mesh + restarts the
#     controller so Ingress → clawql uses mesh mTLS under STRICT (default 1; set 0 if ingress ns missing)
#   CLAWQL_ISTIO_INSTALL_GATEWAY_API_CRDS — for ambient, install Gateway API experimental CRDs if missing (default 1)
#   CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY — 1 installs istio/gateway (clawql-mcp-ingress) + Istio Gateway +
#     VirtualService so MCP uses mesh north-south on :80 / :50051 (default 1)
#   CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP — applied by local-k8s-docker-desktop.sh after Helm (not this
#     script): when 1 with gateway on, patches svc/clawql-mcp-http to ClusterIP (default 1)
#   KUBE_CONTEXT — optional; docker-desktop selected automatically when present

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${CLAWQL_LOCAL_K8S_ISTIO_MODE:-}"
VER="${CLAWQL_ISTIO_VERSION:-1.29.2}"
TARGET_NS="${CLAWQL_TARGET_NAMESPACE:-clawql}"
INSTALL_KIALI="${CLAWQL_ISTIO_INSTALL_KIALI:-1}"
# Prometheus + Kiali are relatively light; Grafana + Jaeger + OTel collector are heavier on RAM/CPU.
HEAVY_OBS="${CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS:-1}"
STRICT="${CLAWQL_ISTIO_APPLY_STRICT_MTLS:-1}"
MESH_INGRESS="${CLAWQL_ISTIO_MESH_INGRESS_NGINX:-1}"
GATEWAY_API="${CLAWQL_ISTIO_INSTALL_GATEWAY_API_CRDS:-1}"
INGRESS_GW_INSTALL="${CLAWQL_ISTIO_INSTALL_INGRESS_GATEWAY:-1}"
INGRESS_GW_NS=istio-ingress
INGRESS_GW_RELEASE=clawql-mcp-ingress
ISTIO_NS=istio-system
HELM_WAIT_TIMEOUT="${CLAWQL_ISTIO_HELM_TIMEOUT:-15m}"

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

KUBE_CONTEXT="${KUBE_CONTEXT:-}"
if kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-desktop'; then
  KUBE_CONTEXT="docker-desktop"
  echo "==> kube context: docker-desktop"
elif kubectl config get-contexts -o name 2>/dev/null | grep -qx 'docker-for-desktop'; then
  KUBE_CONTEXT="docker-for-desktop"
  echo "==> kube context: docker-for-desktop"
fi

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

echo "==> Helm: istio/base"
helm_ctx upgrade --install istio-base istio/base \
  --namespace "${ISTIO_NS}" \
  --create-namespace \
  --version "${VER}" \
  --wait \
  --timeout "${HELM_WAIT_TIMEOUT}"

if [[ "${MODE}" == "ambient" ]]; then
  echo "==> Helm: istiod (profile=ambient)"
  helm_ctx upgrade --install istiod istio/istiod \
    --namespace "${ISTIO_NS}" \
    --version "${VER}" \
    --set profile=ambient \
    --wait \
    --timeout "${HELM_WAIT_TIMEOUT}"

  echo "==> Helm: istio-cni (profile=ambient, namespace ${ISTIO_NS})"
  helm_ctx upgrade --install istio-cni istio/cni \
    --namespace "${ISTIO_NS}" \
    --version "${VER}" \
    --set profile=ambient \
    --wait \
    --timeout "${HELM_WAIT_TIMEOUT}"

  echo "==> Helm: ztunnel"
  helm_ctx upgrade --install ztunnel istio/ztunnel \
    --namespace "${ISTIO_NS}" \
    --version "${VER}" \
    --wait \
    --timeout "${HELM_WAIT_TIMEOUT}"
else
  echo "==> Helm: istiod (default / sidecar dataplane)"
  helm_ctx upgrade --install istiod istio/istiod \
    --namespace "${ISTIO_NS}" \
    --version "${VER}" \
    --wait \
    --timeout "${HELM_WAIT_TIMEOUT}"
fi

if [[ "${INGRESS_GW_INSTALL}" == "1" ]]; then
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
  helm_ctx upgrade --install "${INGRESS_GW_RELEASE}" istio/gateway \
    --namespace "${INGRESS_GW_NS}" \
    --version "${VER}" \
    -f "${GATEWAY_VALUES}" \
    --wait \
    --timeout "${HELM_WAIT_TIMEOUT}"
  kubectl_ctx -n "${INGRESS_GW_NS}" rollout status "deployment/${INGRESS_GW_RELEASE}" --timeout=300s
  sed "s/__TARGET_NAMESPACE__/${TARGET_NS}/g" "${ROOT}/docker/istio/docker-desktop/clawql-mcp-gateway-and-virtualservice.yaml" | kubectl_ctx apply -f -
  echo "    MCP (Istio Gateway, mesh mTLS to pod): http://localhost/mcp  — svc/${INGRESS_GW_RELEASE} HTTP :80"
  echo "    gRPC:                                   localhost:50051     — same Service TCP :50051"
fi

if [[ "${INSTALL_KIALI}" == "1" ]]; then
  echo "==> Addons: Prometheus + Kiali (Istio ${VER} samples; local-only sizing)"
  ADDON_BASE="https://raw.githubusercontent.com/istio/istio/${VER}/samples/addons"
  kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/prometheus.yaml"
  kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/kiali.yaml"
  if [[ "${HEAVY_OBS}" == "1" ]]; then
    echo "==> Addons: Grafana + Jaeger (same upstream samples; set CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0 to skip)"
    kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/grafana.yaml"
    kubectl_ctx apply -n "${ISTIO_NS}" -f "${ADDON_BASE}/jaeger.yaml"
    echo "==> ClawQL OTel Collector → Jaeger (in-cluster OTLP for MCP / workloads)"
    kubectl_ctx apply -f "${ROOT}/docker/istio/docker-desktop/otel-collector.yaml"
  else
    echo "==> Skipping Grafana, Jaeger, OTel collector (CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=0)"
  fi
  echo "    Port-forwards (istio-system):"
  echo "      Kiali:      kubectl port-forward svc/kiali 20001:20001 -n ${ISTIO_NS}"
  echo "      Prometheus: kubectl port-forward svc/prometheus 9090:9090 -n ${ISTIO_NS}"
  if [[ "${HEAVY_OBS}" == "1" ]]; then
    echo "      Grafana:    kubectl port-forward svc/grafana 3000:3000 -n ${ISTIO_NS}"
    echo "      Jaeger UI:  kubectl port-forward svc/tracing 16686:80 -n ${ISTIO_NS}"
    echo "      MCP OTLP:   OTEL_EXPORTER_OTLP_ENDPOINT=http://clawql-otel-collector.${ISTIO_NS}.svc:4318/v1/traces"
  else
    echo "      (Grafana / Jaeger / OTel collector not installed — enable HEAVY_OBSERVABILITY_ADDONS or apply jaeger.yaml manually)"
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
kubectl_ctx get pods -n "${ISTIO_NS}" -o wide

if [[ "${STRICT}" == "1" ]]; then
  echo ""
  echo "STRICT mTLS is enabled in ${TARGET_NS}: all pod traffic must use mesh identity."
  echo "Ingress → ${TARGET_NS} is meshed when ingress-nginx is enrolled (see CLAWQL_ISTIO_MESH_INGRESS_NGINX)."
  if [[ "${INGRESS_GW_INSTALL}" == "1" ]]; then
    echo "MCP via Istio Gateway: http://localhost/mcp (port 80) and gRPC :50051 on svc/${INGRESS_GW_RELEASE} in ${INGRESS_GW_NS}."
  fi
fi
