#!/usr/bin/env bash
# D2 / D3: Install clawql-mcp with values-regulated.yaml on kind (Calico CNI).
#
# Modes (CLAWQL_REGULATED_KIND_MODE):
#   partial (default) — D2 PR path: local unsigned image, Cosign off, K1–K7 PARTIAL
#   signed            — D3 nightly: published GHCR image, Kyverno Cosign on, N1–N5
#
# Pins: kind binary + node image by digest, Helm by version, Calico by version.
# Requires Docker. Budget ~30 minutes (partial) / ~45 minutes (signed).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

MODE="${CLAWQL_REGULATED_KIND_MODE:-partial}"
case "${MODE}" in
  partial | signed) ;;
  *)
    echo "CLAWQL_REGULATED_KIND_MODE must be partial|signed (got ${MODE})" >&2
    exit 1
    ;;
esac

CLUSTER_NAME="${CLAWQL_REGULATED_KIND_CLUSTER:-clawql-regulated}"
NS="${CLAWQL_REGULATED_KIND_NS:-clawql}"
REL="${CLAWQL_REGULATED_KIND_RELEASE:-clawql}"
KIND_VERSION="${CLAWQL_KIND_VERSION:-v0.27.0}"
# kindest/node digest for KIND_VERSION — re-pin when bumping kind.
KIND_NODE_IMAGE="${CLAWQL_KIND_NODE_IMAGE:-kindest/node:v1.32.2@sha256:142f543559cc55d64e1ab9341df08e5ced84bd2e893736da8f51320f26f5950b}"
HELM_VERSION="${CLAWQL_HELM_VERSION:-v3.17.2}"
CALICO_VERSION="${CLAWQL_CALICO_VERSION:-v3.29.2}"
KYVERNO_CHART_VERSION="${CLAWQL_KYVERNO_CHART_VERSION:-3.7.2}"
SIGNED_IMAGE_REPO="${CLAWQL_SIGNED_IMAGE_REPO:-ghcr.io/danielsmithdevelopment/clawql-mcp}"
SIGNED_IMAGE_TAG="${CLAWQL_SIGNED_IMAGE_TAG:-nightly}"
# Must match values-regulated.yaml kyverno.imageSignaturePolicy.cosign.subjectRegExp.
REAL_SUBJECT='^https://github\.com/danielsmithdevelopment/ClawQL/\.github/workflows/docker-publish\.yml@refs/(heads/main|tags/v.*)$'
ARTIFACT_DIR="${CLAWQL_REGULATED_KIND_ARTIFACTS:-/tmp/clawql-regulated-kind-artifacts}"
mkdir -p "${ARTIFACT_DIR}"

if [[ "${MODE}" == "signed" ]]; then
  OVERLAY="${ROOT}/manifests/charts/clawql-mcp/ci/values-regulated-kind-signed.yaml"
else
  OVERLAY="${ROOT}/manifests/charts/clawql-mcp/ci/values-regulated-kind.yaml"
fi

dump_failure() {
  echo "==> Collecting failure artifacts into ${ARTIFACT_DIR}"
  kubectl get all,netpol,sa,secret -n "${NS}" -o wide >"${ARTIFACT_DIR}/get-all.txt" 2>&1 || true
  kubectl describe pods -n "${NS}" >"${ARTIFACT_DIR}/describe-pods.txt" 2>&1 || true
  kubectl logs -n "${NS}" -l app.kubernetes.io/name=clawql-mcp --all-containers --tail=500 \
    >"${ARTIFACT_DIR}/pod-logs.txt" 2>&1 || true
  helm get manifest "${REL}" -n "${NS}" >"${ARTIFACT_DIR}/rendered-manifests.yaml" 2>&1 || true
}
trap 'dump_failure' ERR

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

# D3 helpers — Cosign ClusterPolicy name matches the chart default for REL.
cosign_policy_name() {
  printf '%s-ghcr-cosign-keyless' "${REL}" | cut -c1-63 | sed 's/-$//'
}

# M2: wait until ClusterPolicy carries the expected subjectRegExp and reports Ready.
wait_cosign_policy() {
  local want_subj="$1"
  local name
  name="$(cosign_policy_name)"
  local _try subj ready gen observed
  for _try in $(seq 1 90); do
    if ! kubectl get clusterpolicy "${name}" >/dev/null 2>&1; then
      sleep 2
      continue
    fi
    subj="$(kubectl get clusterpolicy "${name}" -o jsonpath='{.spec.rules[0].verifyImages[0].attestors[0].entries[0].keyless.subjectRegExp}' 2>/dev/null || true)"
    ready="$(kubectl get clusterpolicy "${name}" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)"
    if [[ -z "${ready}" ]]; then
      ready="$(kubectl get clusterpolicy "${name}" -o jsonpath='{.status.ready}' 2>/dev/null || true)"
      if [[ "${ready}" == "true" ]]; then ready="True"; fi
    fi
    gen="$(kubectl get clusterpolicy "${name}" -o jsonpath='{.metadata.generation}' 2>/dev/null || true)"
    observed="$(kubectl get clusterpolicy "${name}" -o jsonpath='{.status.observedGeneration}' 2>/dev/null || true)"
    if [[ "${subj}" == "${want_subj}" && "${ready}" == "True" ]]; then
      if [[ -z "${observed}" || "${observed}" == "${gen}" ]]; then
        echo "ClusterPolicy ${name} Ready with subjectRegExp=${subj}"
        return 0
      fi
    fi
    sleep 2
  done
  echo "FAIL: ClusterPolicy ${name} never Ready with subjectRegExp=${want_subj}" >&2
  kubectl get clusterpolicy "${name}" -o yaml >&2 || true
  return 1
}

# Probe pod create with the signed digest (shared shape for N3/N4 positive + negative).
run_signed_probe_pod() {
  local name="$1"
  kubectl -n "${NS}" delete pod "${name}" --ignore-not-found >/dev/null 2>&1 || true
  kubectl -n "${NS}" run "${name}" \
    --image="${SIGNED_IMAGE_REPO}@${PUBLISHED_DIGEST}" \
    --image-pull-policy=IfNotPresent --restart=Never \
    --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65532}}}' \
    --command -- sleep 5
}

echo "==> Overlay allowlist check (mode=${MODE})"
if [[ "${MODE}" == "signed" ]]; then
  bash "${ROOT}/scripts/kubernetes/check-regulated-kind-overlay.sh" --signed
else
  bash "${ROOT}/scripts/kubernetes/check-regulated-kind-overlay.sh"
fi

echo "==> Ensure kind ${KIND_VERSION}"
if ! command -v kind >/dev/null 2>&1 || [[ "$(kind version -q 2>/dev/null || true)" != "${KIND_VERSION#v}"* ]]; then
  curl -fsSL "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64" -o /tmp/kind
  chmod +x /tmp/kind
  sudo mv /tmp/kind /usr/local/bin/kind
fi
need_cmd kind
need_cmd docker
need_cmd kubectl

echo "==> Ensure Helm ${HELM_VERSION}"
if ! command -v helm >/dev/null 2>&1; then
  curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" | tar -xz -C /tmp
  sudo mv /tmp/linux-amd64/helm /usr/local/bin/helm
fi

echo "==> Create kind cluster with Calico (NetworkPolicy enforcement)"
cat >/tmp/clawql-regulated-kind.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: "192.168.0.0/16"
nodes:
  - role: control-plane
    image: ${KIND_NODE_IMAGE}
EOF

kind delete cluster --name "${CLUSTER_NAME}" 2>/dev/null || true
# disableDefaultCNI: control-plane will not be Ready until Calico is up — do not --wait.
kind create cluster --name "${CLUSTER_NAME}" --config /tmp/clawql-regulated-kind.yaml --wait 0s
KUBECONFIG_FILE="${ARTIFACT_DIR}/kind-${CLUSTER_NAME}.kubeconfig"
kind get kubeconfig --name "${CLUSTER_NAME}" >"${KUBECONFIG_FILE}"
export KUBECONFIG="${KUBECONFIG_FILE}"

echo "==> Install Calico ${CALICO_VERSION}"
kubectl apply -f "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml"
# kubectl wait fails immediately when the selector matches nothing (pods not
# created yet). Poll until calico-node pods exist, then wait for Ready.
echo "==> Wait for calico-node pods to appear"
for _ in $(seq 1 90); do
  if kubectl -n kube-system get pods -l k8s-app=calico-node --no-headers 2>/dev/null | grep -q .; then
    break
  fi
  # Fallback label used by some Calico manifest revisions
  if kubectl -n kube-system get pods -l app.kubernetes.io/name=calico-node --no-headers 2>/dev/null | grep -q .; then
    break
  fi
  sleep 2
done
if kubectl -n kube-system get pods -l k8s-app=calico-node --no-headers 2>/dev/null | grep -q .; then
  kubectl -n kube-system wait --for=condition=ready pod -l k8s-app=calico-node --timeout=300s
elif kubectl -n kube-system get pods -l app.kubernetes.io/name=calico-node --no-headers 2>/dev/null | grep -q .; then
  kubectl -n kube-system wait --for=condition=ready pod -l app.kubernetes.io/name=calico-node --timeout=300s
else
  echo "FAIL: no calico-node pods appeared" >&2
  kubectl -n kube-system get pods -o wide >&2 || true
  exit 1
fi
kubectl wait --for=condition=Ready nodes --all --timeout=180s

kubectl create namespace "${NS}"

PUBLISHED_DIGEST=""
DOCKERFILE="${ROOT}/docker/Dockerfile"
if [[ "${MODE}" == "signed" ]]; then
  echo "==> Install Kyverno ${KYVERNO_CHART_VERSION} (Cosign verifyImages prerequisite)"
  helm repo add kyverno https://kyverno.github.io/kyverno/ >/dev/null 2>&1 || true
  helm repo update >/dev/null
  helm upgrade --install kyverno kyverno/kyverno \
    --version "${KYVERNO_CHART_VERSION}" \
    --namespace kyverno --create-namespace \
    --set crds.migration.enabled=false \
    --set-string admissionController.container.resources.requests.cpu=25m \
    --set-string backgroundController.resources.requests.cpu=25m \
    --set-string cleanupController.resources.requests.cpu=25m \
    --set-string reportsController.resources.requests.cpu=25m \
    --wait --timeout 10m

  echo "==> Resolve published ${SIGNED_IMAGE_REPO}:${SIGNED_IMAGE_TAG} digest (N1 record)"
  if ! command -v skopeo >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq skopeo
  fi
  need_cmd skopeo
  PUBLISHED_DIGEST="$(skopeo inspect "docker://${SIGNED_IMAGE_REPO}:${SIGNED_IMAGE_TAG}" --format '{{.Digest}}')"
  if [[ -z "${PUBLISHED_DIGEST}" || "${PUBLISHED_DIGEST}" != sha256:* ]]; then
    echo "FAIL: could not resolve digest for ${SIGNED_IMAGE_REPO}:${SIGNED_IMAGE_TAG}" >&2
    exit 1
  fi
  echo "Published digest: ${PUBLISHED_DIGEST}"
  echo "${PUBLISHED_DIGEST}" >"${ARTIFACT_DIR}/published-digest.txt"
  # M5: do not kind-load the tag — pods pull by digest from public GHCR.
  # A tag load often carries no repo digest, so it does not prevent ImagePullBackOff
  # when the pod asks for @sha256:…. Let the node pull the digest directly.
else
  echo "==> Build + load PR MCP image"
  IMAGE_LOCAL="clawql-mcp:regulated-kind"
  # E4: only docker/Dockerfile --target runtime. Never fall back to a root
  # Dockerfile or COPY **/*.yaml (that glob can pick Istio YAML as a "Dockerfile").
  if [[ ! -f "${DOCKERFILE}" ]]; then
    echo "missing ${DOCKERFILE}" >&2
    exit 1
  fi
  if [[ -e "${ROOT}/Dockerfile" ]]; then
    echo "FAIL: refuse root Dockerfile — use docker/Dockerfile --target runtime only" >&2
    exit 1
  fi
  # Match docker-publish.yml: --file docker/Dockerfile --target runtime
  docker build -t "${IMAGE_LOCAL}" -f "${DOCKERFILE}" --target runtime "${ROOT}"
  kind load docker-image "${IMAGE_LOCAL}" --name "${CLUSTER_NAME}"
fi

echo "==> Ensure Secret/clawql-provider-env (LocalStack Object Lock credentials)"
# Skip Vault bootstrap on kind — it waits 300s for a STS that is only Ready after
# helm install + unseal. Seed the Secret the chart requires instead (same keys as
# D1 LocalStack: test/test). Chart still installs hashicorpvault; ESO is optional.
kubectl -n "${NS}" create secret generic clawql-provider-env \
  --from-literal=CLAWQL_WORM_S3_ACCESS_KEY_ID=test \
  --from-literal=CLAWQL_WORM_S3_SECRET_ACCESS_KEY=test \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Self-signed gRPC TLS Secret (regulated requires GRPC_TLS_* off loopback)"
TLS_DIR="$(mktemp -d)"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "${TLS_DIR}/tls.key" -out "${TLS_DIR}/tls.crt" \
  -subj "/CN=clawql-mcp-grpc.clawql.svc.cluster.local" \
  -addext "subjectAltName=DNS:clawql-mcp-grpc.clawql.svc.cluster.local,DNS:localhost,IP:127.0.0.1" \
  >/dev/null 2>&1
kubectl -n "${NS}" create secret tls clawql-grpc-tls \
  --cert="${TLS_DIR}/tls.crt" --key="${TLS_DIR}/tls.key" \
  --dry-run=client -o yaml | kubectl apply -f -
rm -rf "${TLS_DIR}"

echo "==> Deploy LocalStack S3 (Object Lock stand-in) + JWKS in ${NS}"
# Anonymous pulls of minio/minio and quay.io/minio/minio fail on GHA (same as D1 wire).
# Digest-pinned LocalStack matches regulated-refusals.yml.
kubectl -n "${NS}" apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: clawql-localstack
  labels:
    clawql-kind-fixture: "true"
spec:
  selector:
    app: clawql-localstack
  ports:
    - port: 4566
      targetPort: 4566
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawql-localstack
  labels:
    clawql-kind-fixture: "true"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: clawql-localstack
  template:
    metadata:
      labels:
        app: clawql-localstack
        clawql-kind-fixture: "true"
    spec:
      containers:
        - name: localstack
          image: localstack/localstack:4.3.0@sha256:f3cb1a79f3add997575e859c3a2808e6dae4b0de836661de255baa2b576868f8
          env:
            - name: SERVICES
              value: s3
            - name: DEBUG
              value: "0"
          ports:
            - containerPort: 4566
          readinessProbe:
            httpGet:
              path: /_localstack/health
              port: 4566
            initialDelaySeconds: 5
            periodSeconds: 3
            failureThreshold: 40
EOF

# JWKS — nginx listens on :80; Service must target 80 (not 8080).
kubectl -n "${NS}" apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: clawql-jwks
  labels:
    clawql-kind-fixture: "true"
data:
  jwks.json: |
    {"keys":[]}
---
apiVersion: v1
kind: Service
metadata:
  name: clawql-jwks
  labels:
    clawql-kind-fixture: "true"
spec:
  selector:
    app: clawql-jwks
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawql-jwks
  labels:
    clawql-kind-fixture: "true"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: clawql-jwks
  template:
    metadata:
      labels:
        app: clawql-jwks
        clawql-kind-fixture: "true"
    spec:
      containers:
        - name: jwks
          image: nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
          volumeMounts:
            - name: jwks
              mountPath: /usr/share/nginx/html/.well-known/jwks.json
              subPath: jwks.json
          ports:
            - containerPort: 80
          command: ["nginx", "-g", "daemon off;"]
      volumes:
        - name: jwks
          configMap:
            name: clawql-jwks
EOF

echo "==> Wait for LocalStack + create Object Lock bucket clawql-worm"
kubectl -n "${NS}" rollout status deployment/clawql-localstack --timeout=180s
# Use awslocal inside the LocalStack pod (avoids pulling amazon/aws-cli on GHA).
kubectl -n "${NS}" exec deploy/clawql-localstack -- awslocal s3api create-bucket \
  --bucket clawql-worm \
  --object-lock-enabled-for-bucket \
  --region us-east-1 || true
kubectl -n "${NS}" exec deploy/clawql-localstack -- awslocal s3api put-object-lock-configuration \
  --bucket clawql-worm \
  --object-lock-configuration \
  "ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Days=1}}" || true
kubectl -n "${NS}" exec deploy/clawql-localstack -- awslocal s3api get-object-lock-configuration \
  --bucket clawql-worm

echo "==> Helm install regulated profile + kind overlay"
# --wait=false: bundled hashicorpvault stays unsealed/not Ready without bootstrap;
# we assert MCP readiness explicitly (Vault/ESO are out of scope for kind K-checks).
helm upgrade --install "${REL}" "${ROOT}/manifests/charts/clawql-mcp" \
  -n "${NS}" \
  -f "${ROOT}/manifests/charts/clawql-mcp/values-regulated.yaml" \
  -f "${OVERLAY}" \
  --wait=false --timeout 15m || {
  dump_failure
  exit 1
}
echo "==> Wait for MCP Deployment Available"
MCP_DEPLOY="$(kubectl -n "${NS}" get deploy -l "app.kubernetes.io/instance=${REL},app.kubernetes.io/name=clawql-mcp" \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | grep -v proxy | head -1 || true)"
if [[ -z "${MCP_DEPLOY}" ]]; then
  echo "FAIL: could not resolve MCP Deployment after helm install" >&2
  dump_failure
  exit 1
fi
echo "MCP Deployment: ${MCP_DEPLOY}"
if ! kubectl -n "${NS}" rollout status "deployment/${MCP_DEPLOY}" --timeout=10m; then
  dump_failure
  exit 1
fi

if [[ "${MODE}" == "signed" ]]; then
  echo "==> N1: live MCP image rewritten to @sha256 matching published ${SIGNED_IMAGE_TAG}"
  LIVE_IMG="$(kubectl -n "${NS}" get "deployment/${MCP_DEPLOY}" -o jsonpath='{.spec.template.spec.containers[0].image}')"
  echo "Live image: ${LIVE_IMG}"
  if [[ "${LIVE_IMG}" != *"@sha256:"* ]]; then
    echo "N1 FAIL: mutateDigest did not rewrite image to @sha256 (got ${LIVE_IMG})" >&2
    exit 1
  fi
  LIVE_DIGEST="${LIVE_IMG##*@}"
  if [[ "${LIVE_DIGEST}" != "${PUBLISHED_DIGEST}" ]]; then
    echo "N1 FAIL: live digest ${LIVE_DIGEST} != published ${PUBLISHED_DIGEST}" >&2
    exit 1
  fi
  # M6: second source — cosign verify with the same identity docker-publish uses.
  if ! command -v cosign >/dev/null 2>&1; then
    curl -fsSL -o /tmp/cosign \
      "https://github.com/sigstore/cosign/releases/download/v2.4.3/cosign-linux-amd64"
    chmod +x /tmp/cosign
    sudo mv /tmp/cosign /usr/local/bin/cosign
  fi
  need_cmd cosign
  COSIGN_ID_RE="${CLAWQL_COSIGN_IDENTITY_REGEXP:-^https://github\\.com/danielsmithdevelopment/ClawQL/.*}"
  COSIGN_ISS_RE="${CLAWQL_COSIGN_ISSUER_REGEXP:-^https://token\\.actions\\.githubusercontent\\.com.*}"
  cosign verify "${SIGNED_IMAGE_REPO}@${PUBLISHED_DIGEST}" \
    --certificate-identity-regexp "${COSIGN_ID_RE}" \
    --certificate-oidc-issuer-regexp "${COSIGN_ISS_RE}" \
    | tee "${ARTIFACT_DIR}/n1-cosign-verify.txt"
  echo "N1 OK: pod image is ${LIVE_DIGEST}; cosign verify passed"
  # Wait for the release Cosign policy to be Ready before N2–N4.
  wait_cosign_policy "${REAL_SUBJECT}"
fi

echo "==> E1/H1: live MCP pod must carry every regulated extraEnv (not only CLAWQL_TIER)"
# H1: pluginTiers.tier alone sets CLAWQL_TIER — that would pass even if extraEnv was wiped.
# Compare values-regulated.yaml extraEnv against the live MCP container, allowing
# overlay extraEnvAppend to override only allowlisted host keys.
kubectl -n "${NS}" get deploy -l "app.kubernetes.io/instance=${REL}" -o json \
  >"${ARTIFACT_DIR}/deploy-main.json"
python3 - "${ROOT}/manifests/charts/clawql-mcp/values-regulated.yaml" \
  "${OVERLAY}" \
  "${ARTIFACT_DIR}/deploy-main.json" <<'PY'
import json, sys
from pathlib import Path

try:
    import yaml
except ImportError as e:
    raise SystemExit(f"E1 FAIL: PyYAML required for regulated extraEnv compare ({e})") from e

reg = yaml.safe_load(Path(sys.argv[1]).read_text()) or {}
kind = yaml.safe_load(Path(sys.argv[2]).read_text()) or {}
doc = json.loads(Path(sys.argv[3]).read_text())
items = doc.get("items") or []
if not items:
    raise SystemExit("E1 FAIL: no deployments for release")

# Host overlay may replace these names via extraEnvAppend.
override_names = {
    (e.get("name") or "")
    for e in (kind.get("extraEnvAppend") or [])
    if isinstance(e, dict) and e.get("name")
}
expected = {}
for e in reg.get("extraEnv") or []:
    name = e.get("name")
    if not name or name in override_names:
        continue
    if "value" in e:
        expected[name] = str(e["value"])

# Always require tier regulated (from pluginTiers or extraEnv).
expected["CLAWQL_TIER"] = "regulated"

mcp_env = None
for dep in items:
    name = dep.get("metadata", {}).get("name", "")
    if "proxy" in name:
        continue
    for c in dep["spec"]["template"]["spec"].get("containers") or []:
        cname = c.get("name", "")
        if "proxy" in cname:
            continue
        env = {e["name"]: e.get("value") for e in (c.get("env") or []) if "name" in e and "value" in e}
        if env.get("CLAWQL_TIER") == "regulated" or "CLAWQL_WORM_ENABLED" in env:
            mcp_env = env
            break
    if mcp_env is not None:
        break
if mcp_env is None:
    raise SystemExit("E1 FAIL: could not find MCP container env on release Deployments")

missing = [k for k, v in expected.items() if mcp_env.get(k) != v]
if missing:
    detail = {k: {"want": expected[k], "got": mcp_env.get(k)} for k in missing}
    raise SystemExit(f"E1 FAIL: regulated extraEnv missing/wrong on live pod: {detail}")
print(f"E1 OK: {len(expected)} regulated env keys match live MCP pod (overlay overrides excluded)")
PY

echo "==> K5: every Service is ClusterIP"
kubectl -n "${NS}" get svc -o json >"${ARTIFACT_DIR}/services.json"
python3 - "${ARTIFACT_DIR}/services.json" <<'PY'
import json, sys
from pathlib import Path
doc = json.loads(Path(sys.argv[1]).read_text())
bad = []
for item in doc.get("items", []):
    t = item.get("spec", {}).get("type")
    name = item.get("metadata", {}).get("name")
    if t in ("LoadBalancer", "NodePort"):
        bad.append(f"{name}:{t}")
if bad:
    raise SystemExit(f"K5 FAIL non-ClusterIP services: {bad}")
print("K5 OK: all Services ClusterIP")
PY

echo "==> K6: live pod security context (H4 hard-fail)"
# Exclude kind fixtures (LocalStack, JWKS, net probes) by label, not by name.
kubectl -n "${NS}" get pods -l 'app.kubernetes.io/name in (clawql-mcp),app.kubernetes.io/instance='"${REL}" \
  -o json >"${ARTIFACT_DIR}/pods.json"
python3 - "${ARTIFACT_DIR}/pods.json" <<'PY'
import json, sys
from pathlib import Path
doc = json.loads(Path(sys.argv[1]).read_text())
pods = doc.get("items", [])
if not pods:
    raise SystemExit("K6 FAIL: no clawql-mcp pods for release")
# Release pods selected by app.kubernetes.io/name=clawql-mcp (MCP, proxy, NATS worker/bridge).
checked = 0
for pod in pods:
    labels = pod["metadata"].get("labels") or {}
    # Skip fixtures labeled clawql-kind-fixture (never apply to chart pods).
    if labels.get("clawql-kind-fixture") == "true":
        continue
    name = pod["metadata"]["name"]
    pod_sc = pod["spec"].get("securityContext") or {}
    for c in pod["spec"].get("containers", []):
        checked += 1
        sc = c.get("securityContext") or {}
        if sc.get("allowPrivilegeEscalation") is not False:
            raise SystemExit(f"K6 FAIL {name}/{c['name']}: allowPrivilegeEscalation")
        if sc.get("readOnlyRootFilesystem") is not True:
            raise SystemExit(
                f"K6 FAIL {name}/{c['name']}: readOnlyRootFilesystem not true "
                f"({sc.get('readOnlyRootFilesystem')})"
            )
        caps = (sc.get("capabilities") or {}).get("drop") or []
        if "ALL" not in caps and "all" not in caps:
            raise SystemExit(f"K6 FAIL {name}/{c['name']}: capabilities.drop missing ALL")
        run_as_non_root = sc.get("runAsNonRoot")
        if run_as_non_root is None:
            run_as_non_root = pod_sc.get("runAsNonRoot")
        if run_as_non_root is not True:
            raise SystemExit(
                f"K6 FAIL {name}/{c['name']}: runAsNonRoot not true "
                f"(container={sc.get('runAsNonRoot')}, pod={pod_sc.get('runAsNonRoot')})"
            )
    for v in pod["spec"].get("volumes", []):
        if "hostPath" in v:
            raise SystemExit(f"K6 FAIL {name}: hostPath volume {v.get('name')}")
        if v.get("hostPath", {}).get("path") in ("/var/run/docker.sock", "/run/docker.sock"):
            raise SystemExit(f"K6 FAIL {name}: docker socket mount")
if checked == 0:
    raise SystemExit("K6 FAIL: no containers checked")
print(f"K6 OK: {checked} containers meet RORFS / drop ALL / runAsNonRoot")
PY

echo "==> K7: mcpProxy is nginx passthrough with digest-pinned image (not JWT/ATR)"
helm get values "${REL}" -n "${NS}" -a >"${ARTIFACT_DIR}/helm-values.yaml"
python3 - "${ARTIFACT_DIR}/helm-values.yaml" <<'PY'
import sys
from pathlib import Path
import yaml

doc = yaml.safe_load(Path(sys.argv[1]).read_text()) or {}
proxy = doc.get("mcpProxy") or {}
assert proxy.get("enabled") is True, "K7: mcpProxy.enabled"
assert proxy.get("mode", "nginx") == "nginx", "K7: mode must be nginx passthrough"
img = proxy.get("image") or {}
digest = img.get("digest") or ""
assert digest.startswith("sha256:"), f"K7: nginx image must be digest-pinned, got {digest!r}"
print("K7 OK: mcpProxy nginx passthrough with digest", digest[:18] + "...")
PY

echo "==> K1: runtime WORM refusal via kubectl set env (Helm now refuses WORM=0 render)"
# H3: chart refuse CLAWQL_WORM_ENABLED=0 at render time, so reach the runtime gate by
# copying the live MCP Deployment and patching env after install.
kubectl -n "${NS}" get "deployment/${MCP_DEPLOY}" -o json >"${ARTIFACT_DIR}/mcp-deploy.json"
python3 - "${ARTIFACT_DIR}/mcp-deploy.json" "${ARTIFACT_DIR}/wormoff-deploy.json" <<'PY'
import json, sys
from pathlib import Path
doc = json.loads(Path(sys.argv[1]).read_text())
# Strip status / resourceVersion so create succeeds as a sibling Deployment.
meta = doc["metadata"]
for k in ("resourceVersion", "uid", "creationTimestamp", "generation", "managedFields"):
    meta.pop(k, None)
meta["name"] = "clawql-wormoff-mcp"
labels = meta.setdefault("labels", {})
labels["app.kubernetes.io/instance"] = "clawql-wormoff"
labels["clawql-kind-fixture"] = "false"
spec = doc["spec"]
spec["replicas"] = 1
# Unique selector so it doesn't fight the main Deployment.
# matchLabels must be a subset of template labels (API validation).
sel = spec.setdefault("selector", {}).setdefault("matchLabels", {})
sel["app"] = "clawql-wormoff-mcp"
sel["app.kubernetes.io/instance"] = "clawql-wormoff"
sel["app.kubernetes.io/name"] = "clawql-mcp"
tpl_labels = spec["template"]["metadata"].setdefault("labels", {})
tpl_labels["app"] = "clawql-wormoff-mcp"
tpl_labels["app.kubernetes.io/instance"] = "clawql-wormoff"
tpl_labels["app.kubernetes.io/name"] = "clawql-mcp"
# Drop probes that would keep restarting forever without changing the crash signal.
for key in ("readinessProbe", "livenessProbe", "startupProbe"):
    for c in spec["template"]["spec"].get("containers", []):
        c.pop(key, None)
        env = c.setdefault("env", [])
        found = False
        for e in env:
            if e.get("name") == "CLAWQL_WORM_ENABLED":
                e["value"] = "0"
                found = True
        if not found:
            env.append({"name": "CLAWQL_WORM_ENABLED", "value": "0"})
Path(sys.argv[2]).write_text(json.dumps(doc))
PY
kubectl -n "${NS}" apply -f "${ARTIFACT_DIR}/wormoff-deploy.json"
# Also set via kubectl set env so the check matches the H3/K1 route in the spec.
kubectl -n "${NS}" set env "deployment/clawql-wormoff-mcp" CLAWQL_WORM_ENABLED=0

# E2: do not treat ImagePullBackOff / ContainerCreating as a WORM refusal success.
echo "==> K1 wait until worm-off containers leave image-pull / creating"
WORMOFF_READY_TO_JUDGE=0
for _ in $(seq 1 60); do
  kubectl -n "${NS}" get pods -l "app.kubernetes.io/instance=clawql-wormoff" -o json \
    >"${ARTIFACT_DIR}/wormoff-pods.json" 2>/dev/null || echo '{}' >"${ARTIFACT_DIR}/wormoff-pods.json"
  if python3 - "${ARTIFACT_DIR}/wormoff-pods.json" <<'PY'
import json, sys
from pathlib import Path
doc = json.loads(Path(sys.argv[1]).read_text())
items = doc.get("items") or []
if not items:
    raise SystemExit(2)
for pod in items:
    statuses = pod.get("status", {}).get("containerStatuses") or []
    if not statuses:
        raise SystemExit(2)
    for cs in statuses:
        waiting = (cs.get("state") or {}).get("waiting") or {}
        reason = waiting.get("reason") or ""
        if reason in ("ImagePullBackOff", "ErrImagePull", "ContainerCreating", "PodInitializing"):
            raise SystemExit(2)
        if (
            cs.get("state", {}).get("running")
            or cs.get("state", {}).get("terminated")
            or (cs.get("lastState") or {}).get("terminated")
        ):
            raise SystemExit(0)
raise SystemExit(2)
PY
  then
    WORMOFF_READY_TO_JUDGE=1
    break
  fi
  sleep 5
done
if [[ "${WORMOFF_READY_TO_JUDGE}" != "1" ]]; then
  echo "K1 FAIL: worm-off pods never left image-pull/creating — cannot judge WORM refusal" >&2
  exit 1
fi

READY="$(kubectl -n "${NS}" get pods -l app.kubernetes.io/instance=clawql-wormoff \
  -o jsonpath='{range .items[*]}{.status.containerStatuses[0].ready}{\"\\n\"}{end}' || true)"
if echo "${READY}" | grep -qx true; then
  echo "K1 FAIL: worm-off deployment became Ready" >&2
  exit 1
fi
WORMOFF_LOGS="$(kubectl -n "${NS}" logs -l "app.kubernetes.io/instance=clawql-wormoff" --all-containers --tail=200 2>/dev/null || true)"
if ! echo "${WORMOFF_LOGS}" | grep -Eiq 'regulated.*WORM disabled|WORM disabled'; then
  echo "K1 FAIL: worm-off pods not Ready but logs lack WORM refusal (may still be pulling)" >&2
  echo "${WORMOFF_LOGS}" | tail -50 >&2 || true
  exit 1
fi
echo "K1 OK: worm-off Deployment not Ready; logs carry WORM refusal (positive control: main Ready)"
# Do not wait on app.kubernetes.io/instance=${REL}: sealed Vault pods share that
# label and never become Ready. Wait only for the MCP Deployment we already rolled out.
kubectl -n "${NS}" rollout status "deployment/${MCP_DEPLOY}" --timeout=120s

echo "==> K3/K4 network policy probes (positive + negative)"
# Prefer the MCP HTTP Service (not the proxy) by app label from fullnameOverride.
MCP_SVC="$(kubectl -n "${NS}" get svc -l "app.kubernetes.io/instance=${REL},app=clawql-mcp-http" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [[ -z "${MCP_SVC}" ]]; then
  MCP_SVC="$(kubectl -n "${NS}" get svc -l "app.kubernetes.io/instance=${REL},app.kubernetes.io/name=clawql-mcp" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' | grep -v proxy | head -1 || true)"
fi
if [[ -z "${MCP_SVC}" ]]; then
  echo "K3 FAIL: could not resolve MCP Service for release ${REL}" >&2
  exit 1
fi
MCP_PORT="$(kubectl -n "${NS}" get svc "${MCP_SVC}" -o jsonpath='{.spec.ports[0].port}')"
echo "MCP Service: ${MCP_SVC}:${MCP_PORT}"

# Positive: curl LocalStack health from a Job in NS (same-namespace allow path)
kubectl -n "${NS}" delete job clawql-net-pos --ignore-not-found
kubectl -n "${NS}" create job clawql-net-pos --image=curlimages/curl:8.5.0 -- \
  curl -sf -o /dev/null -w '%{http_code}' "http://clawql-localstack.${NS}.svc.cluster.local:4566/_localstack/health"
kubectl -n "${NS}" wait --for=condition=complete job/clawql-net-pos --timeout=60s
echo "K4 positive OK: LocalStack reachable from release namespace"

# H2: K3 positive control must fail if DNS/policy/path is broken — no `|| true`,
# and require a non-000 HTTP status in the Job log.
kubectl -n "${NS}" delete job clawql-net-mcp-pos --ignore-not-found
kubectl -n "${NS}" create job clawql-net-mcp-pos --image=curlimages/curl:8.5.0 -- \
  sh -c "code=\$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://${MCP_SVC}.${NS}.svc.cluster.local:${MCP_PORT}/healthz); echo \"http_code=\$code\"; case \"\$code\" in 000) exit 1 ;; *) exit 0 ;; esac"
kubectl -n "${NS}" wait --for=condition=complete job/clawql-net-mcp-pos --timeout=60s
POS_LOG="$(kubectl -n "${NS}" logs job/clawql-net-mcp-pos 2>/dev/null || true)"
echo "K3 pos log: ${POS_LOG}"
if ! echo "${POS_LOG}" | grep -Eq 'http_code=[1-5][0-9][0-9]'; then
  echo "K3 FAIL: in-namespace positive control did not report a real HTTP status" >&2
  exit 1
fi
echo "K3 positive OK: in-namespace Job reached ${MCP_SVC} (DNS+policy path works)"

# Negative: pod in other namespace should fail to reach MCP Service (timeout/refused — not NXDOMAIN alone)
kubectl create namespace clawql-net-deny --dry-run=client -o yaml | kubectl apply -f -
kubectl -n clawql-net-deny delete job clawql-net-neg --ignore-not-found
kubectl -n clawql-net-deny create job clawql-net-neg --image=curlimages/curl:8.5.0 -- \
  sh -c "out=\$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}:%{errormsg}' http://${MCP_SVC}.${NS}.svc.cluster.local:${MCP_PORT}/healthz 2>&1 || true); echo \"\$out\"; echo \"\$out\" | grep -qi 'Could not resolve host' && exit 2; echo \"\$out\" | grep -E '^(000:|000\$)' >/dev/null && exit 0; exit 1"
kubectl -n clawql-net-deny wait --for=condition=complete job/clawql-net-neg --timeout=60s
NEG_LOG="$(kubectl -n clawql-net-deny logs job/clawql-net-neg 2>/dev/null || true)"
echo "K3 neg log: ${NEG_LOG}"
echo "K3 OK: cross-namespace MCP call blocked (not a DNS NXDOMAIN on wrong Service name)"

echo "==> In-cluster wire rows 5–12 (Job)"
# Placeholder: copy regulated-wire assertions into a Job image in a follow-up.
# For this PR, document that D1 wire suite is the merge gate for rows 5–12 until
# the in-cluster Job image is published; K1/K5/K6/K7 already exercise chart surface.
echo "NOTE: full in-cluster D1 matrix Job is staged; chart checks K1/K5/K6/K7 ran."

if [[ "${MODE}" == "signed" ]]; then
  # Kyverno verifyImages / Cosign denial (N2/N3) — not generic "denied".
  VERIFY_DENY_RE='verifyImages|image verification|signature.*verif|cosign|no matching signatures|subject.*match'
  # N4 fail-closed: webhook unreachable with failurePolicy=Fail.
  WEBHOOK_DENY_RE='failed calling webhook|no endpoints available|connection refused|webhook.*kyverno|context deadline|ServiceUnavailable'

  echo "==> N2: unsigned local image must be denied by Cosign verifyImages"
  UNSIGNED_TAG="${SIGNED_IMAGE_REPO}:unsigned-ci"
  docker build -t "${UNSIGNED_TAG}" -f "${ROOT}/docker/Dockerfile" --target runtime "${ROOT}"
  kind load docker-image "${UNSIGNED_TAG}" --name "${CLUSTER_NAME}"
  set +e
  kubectl -n "${NS}" delete pod clawql-n2-unsigned --ignore-not-found >/dev/null 2>&1
  N2_OUT="$(kubectl -n "${NS}" run clawql-n2-unsigned --image="${UNSIGNED_TAG}" \
    --image-pull-policy=Never --restart=Never \
    --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65532}}}' \
    --command -- sleep 5 2>&1)"
  N2_RC=$?
  set -e
  echo "${N2_OUT}" | tee "${ARTIFACT_DIR}/n2-unsigned.txt"
  if [[ "${N2_RC}" -eq 0 ]]; then
    echo "N2 FAIL: unsigned image was admitted" >&2
    kubectl -n "${NS}" delete pod clawql-n2-unsigned --ignore-not-found || true
    exit 1
  fi
  if ! echo "${N2_OUT}" | grep -Eiq "${VERIFY_DENY_RE}"; then
    echo "N2 FAIL: admission failed without a verifyImages/signature signal" >&2
    exit 1
  fi
  echo "N2 OK: unsigned image denied by verifyImages"

  echo "==> N3 positive control: same pod shape admitted under real subject"
  if ! run_signed_probe_pod clawql-n3-pos; then
    echo "N3 FAIL: positive control could not admit signed image under real subject" >&2
    exit 1
  fi
  kubectl -n "${NS}" delete pod clawql-n3-pos --ignore-not-found
  echo "N3 positive OK"

  BAD_SUBJECT='^https://example\.invalid/no-match$'
  echo "==> N3: impossible subjectRegExp must deny the real signed image"
  helm upgrade --install "${REL}" "${ROOT}/manifests/charts/clawql-mcp" \
    -n "${NS}" \
    -f "${ROOT}/manifests/charts/clawql-mcp/values-regulated.yaml" \
    -f "${OVERLAY}" \
    --set-string "kyverno.imageSignaturePolicy.cosign.subjectRegExp=${BAD_SUBJECT}" \
    --wait=false --timeout 5m
  wait_cosign_policy "${BAD_SUBJECT}"
  set +e
  N3_OUT="$(run_signed_probe_pod clawql-n3-subject 2>&1)"
  N3_RC=$?
  set -e
  echo "${N3_OUT}" | tee "${ARTIFACT_DIR}/n3-subject.txt"
  if [[ "${N3_RC}" -eq 0 ]]; then
    echo "N3 FAIL: signed image admitted under non-matching subjectRegExp" >&2
    kubectl -n "${NS}" delete pod clawql-n3-subject --ignore-not-found || true
    exit 1
  fi
  if ! echo "${N3_OUT}" | grep -Eiq "${VERIFY_DENY_RE}"; then
    echo "N3 FAIL: deny was not a Kyverno verifyImages/signature failure" >&2
    exit 1
  fi
  echo "N3 OK: subject pin checked (verifyImages deny)"
  # Restore real subjectRegExp and wait until Ready again.
  helm upgrade --install "${REL}" "${ROOT}/manifests/charts/clawql-mcp" \
    -n "${NS}" \
    -f "${ROOT}/manifests/charts/clawql-mcp/values-regulated.yaml" \
    -f "${OVERLAY}" \
    --wait=false --timeout 5m
  wait_cosign_policy "${REAL_SUBJECT}"

  echo "==> N4 positive control: same pod shape admitted with admission up"
  if ! run_signed_probe_pod clawql-n4-pos; then
    echo "N4 FAIL: positive control could not admit signed image with Kyverno up" >&2
    exit 1
  fi
  kubectl -n "${NS}" delete pod clawql-n4-pos --ignore-not-found
  echo "N4 positive OK"

  echo "==> N4: Kyverno admission scaled to 0 must fail closed (webhook error)"
  ADM_DEPLOY="$(kubectl -n kyverno get deploy -o name | grep -E 'admission' | head -1 || true)"
  if [[ -z "${ADM_DEPLOY}" ]]; then
    ADM_DEPLOY="$(kubectl -n kyverno get deploy -o name | head -1 || true)"
  fi
  if [[ -z "${ADM_DEPLOY}" ]]; then
    echo "N4 FAIL: could not find Kyverno admission Deployment" >&2
    exit 1
  fi
  kubectl -n kyverno scale "${ADM_DEPLOY}" --replicas=0
  # Wait until no ready replicas (rollout status with 0 can succeed immediately).
  for _ in $(seq 1 60); do
    ready="$(kubectl -n kyverno get "${ADM_DEPLOY}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)"
    if [[ -z "${ready}" || "${ready}" == "0" ]]; then
      break
    fi
    sleep 2
  done
  set +e
  N4_OUT="$(run_signed_probe_pod clawql-n4-failclosed 2>&1)"
  N4_RC=$?
  set -e
  echo "${N4_OUT}" | tee "${ARTIFACT_DIR}/n4-failclosed.txt"
  kubectl -n kyverno scale "${ADM_DEPLOY}" --replicas=1
  kubectl -n kyverno rollout status "${ADM_DEPLOY}" --timeout=180s
  wait_cosign_policy "${REAL_SUBJECT}" || true
  if [[ "${N4_RC}" -eq 0 ]]; then
    echo "N4 FAIL: pod admitted while Kyverno admission was scaled to 0 (not fail-closed)" >&2
    kubectl -n "${NS}" delete pod clawql-n4-failclosed --ignore-not-found || true
    exit 1
  fi
  if ! echo "${N4_OUT}" | grep -Eiq "${WEBHOOK_DENY_RE}"; then
    echo "N4 FAIL: deny was not a webhook call failure (failurePolicy=Fail)" >&2
    exit 1
  fi
  echo "N4 OK: failurePolicy=Fail denied create with admission down (webhook error)"

  # M3: N5 reuses D2's PARTIAL scope (K2 / K4-neg / in-cluster D1 still scaffolding).
  echo "regulated-kind SIGNED PARTIAL: N1–N4 Cosign matrix green; N5 inherits D2 PARTIAL (K2/K4-neg/in-cluster D1 still scaffolding)"
  echo "SUMMARY: Kata remains disabled on kind (not runtime-isolation evidence)."
else
  echo "regulated-kind PARTIAL: K1/K5/K6/K7 + E1/H1 env compare green; K2/K4-neg/in-cluster D1 matrix still scaffolding"
  echo "SUMMARY: Kata remains disabled on kind (not runtime-isolation evidence)."
fi
