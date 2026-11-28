# shellcheck shell=bash
# D5 helpers for test-regulated-kind.sh — JWKS key, K2, K4-neg, in-cluster wire.
# Sourced by the driver; expects NS, REL, ROOT, ARTIFACT_DIR, MCP_DEPLOY, MODE.

# Digest-pinned curl for Jobs + kubectl debug ephemeral containers (D5 open Q2).
CURL_IMAGE="${CLAWQL_CURL_IMAGE:-curlimages/curl:8.5.0@sha256:08e466006f0860e54fc299378de998935333e0e130a15f6f98482e9f8dab3058}"
WIRE_IMAGE="${CLAWQL_WIRE_TESTS_IMAGE:-clawql-wire-tests:ci}"
WIRE_OIDC_KID="${CLAWQL_WIRE_OIDC_KID:-kind-wire}"
WORM_HTTP_PORT="${CLAWQL_KIND_WORM_HTTP_PORT:-9090}"
AUDIT_API_KEY="${CLAWQL_KIND_AUDIT_API_KEY:-kind-wire-audit-key}"

# Generate EC P-256 (prime256v1) keypair; write PKCS8 private PEM + JWKS JSON.
# Args: $1=outdir
d5_mint_jwks_keypair() {
  local out="$1"
  mkdir -p "${out}"
  openssl ecparam -name prime256v1 -genkey -noout -out "${out}/ec.pem"
  openssl pkcs8 -topk8 -nocrypt -in "${out}/ec.pem" -out "${out}/private.pem"
  openssl pkey -in "${out}/private.pem" -pubout -out "${out}/public.pem"
  (
    cd "${ROOT}"
    node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { importSPKI, exportJWK } from 'jose';
const pub = await importSPKI(readFileSync('${out}/public.pem', 'utf8'), 'ES256');
const jwk = await exportJWK(pub);
jwk.alg = 'ES256';
jwk.use = 'sig';
jwk.kid = '${WIRE_OIDC_KID}';
writeFileSync('${out}/jwks.json', JSON.stringify({ keys: [jwk] }) + '\n');
"
  )
  echo "D5: minted EC P-256 JWKS kid=${WIRE_OIDC_KID}"
}

# Apply JWKS ConfigMap body from a file (replaces empty {"keys":[]}).
# Args: $1=jwks.json path
d5_apply_jwks_configmap() {
  local jwks_file="$1"
  kubectl -n "${NS}" create configmap clawql-jwks \
    --from-file=jwks.json="${jwks_file}" \
    --dry-run=client -o yaml |
    kubectl label --local -f - clawql-kind-fixture=true -o yaml |
    kubectl apply -f -
  kubectl -n "${NS}" rollout restart deployment/clawql-jwks
  kubectl -n "${NS}" rollout status deployment/clawql-jwks --timeout=90s
}

# Store private key Secret for the wire Job only.
d5_apply_wire_signing_secret() {
  local priv="$1"
  kubectl -n "${NS}" create secret generic clawql-wire-signing \
    --from-file=private.pem="${priv}" \
    --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n "${NS}" label secret clawql-wire-signing clawql-kind-fixture=true --overwrite
}

# K2: second release whose Secret omits CLAWQL_WORM_S3_SECRET_ACCESS_KEY.
d5_run_k2_missing_secret() {
  echo "==> K2: release with incomplete provider Secret (missing S3 secret key)"
  local k2_rel="${REL}-k2"
  kubectl -n "${NS}" create secret generic clawql-provider-env-k2 \
    --from-literal=CLAWQL_WORM_S3_ACCESS_KEY_ID=test \
    --dry-run=client -o yaml | kubectl apply -f -

  local k2_vals
  k2_vals="$(mktemp)"
  cat >"${k2_vals}" <<EOF
envFromSecret: clawql-provider-env-k2
fullnameOverride: clawql-mcp-http-k2
EOF

  # Install without waiting — pod must never become Ready.
  helm upgrade --install "${k2_rel}" "${ROOT}/manifests/charts/clawql-mcp" \
    -n "${NS}" \
    -f "${ROOT}/manifests/charts/clawql-mcp/values-regulated.yaml" \
    -f "${OVERLAY}" \
    -f "${k2_vals}" \
    --wait=false

  local deploy="clawql-mcp-http-k2"
  # Wait briefly for pod creation, then assert never Ready + log line.
  local _i ready_ok=0
  for _i in $(seq 1 36); do
    local phase logs
    phase="$(kubectl -n "${NS}" get pods -l "app=${deploy}" -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)"
    if [[ -n "${phase}" ]]; then
      break
    fi
    sleep 5
  done
  for _i in $(seq 1 24); do
    local ready
    ready="$(kubectl -n "${NS}" get deploy "${deploy}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)"
    if [[ "${ready}" == "1" ]]; then
      ready_ok=1
      break
    fi
    logs="$(kubectl -n "${NS}" logs -l "app=${deploy}" --tail=80 2>/dev/null || true)"
    if echo "${logs}" | grep -Eiq 'WORM|S3|SECRET_ACCESS_KEY|Access Key|credentials|Credential'; then
      echo "K2 OK: incomplete Secret → WORM/S3 error in logs (main release is positive control)"
      echo "${logs}" | tail -20
      rm -f "${k2_vals}"
      return 0
    fi
    sleep 5
  done
  if [[ "${ready_ok}" == "1" ]]; then
    echo "K2 FAIL: k2 release became Ready without S3 secret key" >&2
    kubectl -n "${NS}" logs -l "app=${deploy}" --tail=100 >&2 || true
    rm -f "${k2_vals}"
    return 1
  fi
  logs="$(kubectl -n "${NS}" logs -l "app=${deploy}" --tail=100 2>/dev/null || true)"
  if echo "${logs}" | grep -Eiq 'WORM|S3|SECRET_ACCESS_KEY|Access Key|credentials|Credential'; then
    echo "K2 OK: pod not Ready; logs carry WORM/S3 credential error"
    rm -f "${k2_vals}"
    return 0
  fi
  echo "K2 FAIL: pod not Ready but logs lack WORM/S3 credential error" >&2
  echo "${logs}" >&2
  kubectl -n "${NS}" describe deploy "${deploy}" >&2 || true
  rm -f "${k2_vals}"
  return 1
}

# Attach an ephemeral curl container to the MCP pod and run a command.
# Args: $1=pod $2=target container $3=shell command $4=logfile
# Exit status mirrors the ephemeral container's exit code.
d5_ephemeral_curl() {
  local pod="$1"
  local target="$2"
  local cmd="$3"
  local logfile="$4"
  local ec_name
  ec_name="d5-curl-$(date +%s)"
  kubectl -n "${NS}" debug "pod/${pod}" \
    --image="${CURL_IMAGE}" \
    --target="${target}" \
    --container="${ec_name}" \
    --profile=general \
    --quiet \
    --attach=false \
    -- sh -c "${cmd}" >/dev/null
  local _i
  for _i in $(seq 1 60); do
    local state
    state="$(kubectl -n "${NS}" get pod "${pod}" -o jsonpath="{.status.ephemeralContainerStatuses[?(@.name==\"${ec_name}\")].state.terminated.exitCode}" 2>/dev/null || true)"
    if [[ -n "${state}" ]]; then
      kubectl -n "${NS}" logs "pod/${pod}" -c "${ec_name}" >"${logfile}" 2>&1 || true
      cat "${logfile}"
      return "${state}"
    fi
    sleep 2
  done
  echo "K4 FAIL: ephemeral container ${ec_name} did not terminate" >&2
  kubectl -n "${NS}" get pod "${pod}" -o yaml >&2 || true
  return 1
}

# K4 negatives from the MCP pod's network namespace via kubectl debug.
d5_run_k4_negatives() {
  echo "==> K4 negatives: kubectl debug ephemeral on MCP pod (shared netns)"
  local pod container
  pod="$(kubectl -n "${NS}" get pods -l "app=${MCP_DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"
  container="$(kubectl -n "${NS}" get pod "${pod}" -o jsonpath='{.spec.containers[0].name}')"
  echo "MCP pod=${pod} container=${container}"

  # Deny-namespace HTTP target (cross-ns, not in extraEgress).
  kubectl create namespace clawql-net-deny --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n clawql-net-deny apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawql-deny-http
  labels:
    clawql-kind-fixture: "true"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: clawql-deny-http
  template:
    metadata:
      labels:
        app: clawql-deny-http
        clawql-kind-fixture: "true"
    spec:
      containers:
        - name: http
          image: nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: clawql-deny-http
  labels:
    clawql-kind-fixture: "true"
spec:
  selector:
    app: clawql-deny-http
  ports:
    - port: 80
      targetPort: 80
EOF
  kubectl -n clawql-net-deny rollout status deployment/clawql-deny-http --timeout=90s

  # Positive controls from the same netns: LocalStack + JWKS.
  local pos_cmd pos_log
  pos_log="${ARTIFACT_DIR}/k4-pos-ephemeral.log"
  pos_cmd="set -e; c1=\$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://clawql-localstack.${NS}.svc.cluster.local:4566/_localstack/health || true); c2=\$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://clawql-jwks.${NS}.svc.cluster.local/.well-known/jwks.json || true); echo \"pos localstack=\$c1 jwks=\$c2\"; case \"\$c1\" in 000) exit 1;; esac; case \"\$c2\" in 000) exit 1;; esac; exit 0"
  set +e
  d5_ephemeral_curl "${pod}" "${container}" "${pos_cmd}" "${pos_log}"
  local pos_rc=$?
  set -e
  if [[ "${pos_rc}" -ne 0 ]]; then
    echo "K4 FAIL: positive control from MCP netns failed (LocalStack/JWKS)" >&2
    return 1
  fi
  echo "K4 positive OK: LocalStack + JWKS reachable from MCP pod netns"

  # Negatives — each must be connect timeout (000), not DNS failure.
  # Chart default-deny allows public :80/:443 for IdP JWKS; 1.1.1.1:443 is therefore
  # NOT a deny target. Use 1.1.1.1:8443 (non-allowlisted port) as the external-IP deny.
  # 169.254.169.254 is in the ipBlock except list; clawql-net-deny is cross-ns.
  local neg_cmd neg_log
  neg_log="${ARTIFACT_DIR}/k4-neg-ephemeral.log"
  neg_cmd="set +e; fail=0; for t in 'http://1.1.1.1:8443/' 'http://169.254.169.254:80/' 'http://clawql-deny-http.clawql-net-deny.svc.cluster.local/'; do out=\$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}:%{errormsg}' \"\$t\" 2>&1 || true); echo \"neg \$t => \$out\"; echo \"\$out\" | grep -qi 'Could not resolve host' && { echo DNS_FAIL; fail=1; continue; }; echo \"\$out\" | grep -E '^(000:|000\$)' >/dev/null || { echo NOT_TIMEOUT; fail=1; }; done; exit \$fail"
  set +e
  d5_ephemeral_curl "${pod}" "${container}" "${neg_cmd}" "${neg_log}"
  local neg_rc=$?
  set -e
  if [[ "${neg_rc}" -ne 0 ]]; then
    echo "K4 FAIL: a negative probe did not fail by connect timeout (000)" >&2
    return 1
  fi
  echo "K4 OK: external non-allowlisted port, link-local, and cross-ns Service blocked (000)"
}

# Configure MCP for in-cluster wire: petstore spec, sink, WORM HTTP, instance spec.
d5_configure_mcp_for_wire() {
  echo "==> D5: wire sink + petstore ConfigMap + MCP env for remote rows"
  # Sink Deployment (records hits for rows 6/7b/11).
  kubectl -n "${NS}" apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: clawql-wire-sink-src
  labels:
    clawql-kind-fixture: "true"
data:
  wire-sink-server.mjs: |
$(sed 's/^/    /' "${ROOT}/scripts/security/fixtures/wire-sink-server.mjs")
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clawql-wire-sink
  labels:
    clawql-kind-fixture: "true"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: clawql-wire-sink
  template:
    metadata:
      labels:
        app: clawql-wire-sink
        clawql-kind-fixture: "true"
    spec:
      containers:
        - name: sink
          image: ${WIRE_IMAGE}
          imagePullPolicy: Never
          command: ["node", "/sink/wire-sink-server.mjs"]
          env:
            - name: PORT
              value: "8080"
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: src
              mountPath: /sink
      volumes:
        - name: src
          configMap:
            name: clawql-wire-sink-src
---
apiVersion: v1
kind: Service
metadata:
  name: clawql-wire-sink
  labels:
    clawql-kind-fixture: "true"
spec:
  selector:
    app: clawql-wire-sink
  ports:
    - port: 8080
      targetPort: 8080
EOF

  # Petstore OpenAPI for execute/park rows.
  local pet
  pet="$(mktemp)"
  node --input-type=module -e "
import { writeFileSync } from 'node:fs';
const spec = {
  openapi: '3.0.3',
  info: { title: 'PetstoreWire', version: '1' },
  servers: [{ url: 'http://clawql-wire-sink.${NS}.svc.cluster.local:8080' }],
  paths: {
    '/pets/{id}': {
      patch: {
        operationId: 'patchItem',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
  },
};
writeFileSync('${pet}', JSON.stringify(spec, null, 2) + '\n');
"
  kubectl -n "${NS}" create configmap clawql-wire-petstore \
    --from-file=petstore-patch.json="${pet}" \
    --dry-run=client -o yaml |
    kubectl label --local -f - clawql-kind-fixture=true -o yaml |
    kubectl apply -f -
  rm -f "${pet}"

  # Patch MCP Deployment: mount petstore + set wire env (WORM HTTP, SPEC_PATH, sink).
  local instance_spec cname
  instance_spec='{"tier":"regulated","memory":{"enabled":false},"documents":{"enabled":false},"sandbox":{"enabled":false},"data":{"enabled":false},"automation":{"schedule":{"enabled":false},"notify":{"enabled":false},"workflow":{"enabled":false},"argocd":{"enabled":false},"hitlLabelStudio":{"enabled":true}}}'
  cname="$(kubectl -n "${NS}" get deploy "${MCP_DEPLOY}" -o jsonpath='{.spec.template.spec.containers[0].name}')"
  python3 - "${NS}" "${MCP_DEPLOY}" "${cname}" <<'PY'
import json, subprocess, sys
ns, deploy, cname = sys.argv[1], sys.argv[2], sys.argv[3]
raw = subprocess.check_output(
    ["kubectl", "-n", ns, "get", "deploy", deploy, "-o", "json"], text=True
)
doc = json.loads(raw)
tpl = doc["spec"]["template"]["spec"]
vols = tpl.setdefault("volumes", [])
if not any(v.get("name") == "wire-petstore" for v in vols):
    vols.append({"name": "wire-petstore", "configMap": {"name": "clawql-wire-petstore"}})
for c in tpl["containers"]:
    if c.get("name") != cname:
        continue
    mounts = c.setdefault("volumeMounts", [])
    if not any(m.get("name") == "wire-petstore" for m in mounts):
        mounts.append({"name": "wire-petstore", "mountPath": "/config/wire", "readOnly": True})
patch = {"spec": {"template": {"spec": {"volumes": vols, "containers": tpl["containers"]}}}}
subprocess.run(
    ["kubectl", "-n", ns, "patch", "deploy", deploy, "--type=strategic", "-p", json.dumps(patch)],
    check=True,
)
PY

  kubectl -n "${NS}" set env "deployment/${MCP_DEPLOY}" \
    "CLAWQL_SPEC_PATH=/config/wire/petstore-patch.json" \
    "CLAWQL_API_BASE_URL=http://clawql-wire-sink.${NS}.svc.cluster.local:8080" \
    "API_BASE_URL=http://clawql-wire-sink.${NS}.svc.cluster.local:8080" \
    "CLAWQL_INSTANCE_SPEC=${instance_spec}" \
    "CLAWQL_PENDING_STORE=sqlite" \
    "CLAWQL_SECRET_STORE=memory" \
    "CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1" \
    "CLAWQL_HTTP_SKIP_PAYMENTS=1" \
    "CLAWQL_HTTP_SKIP_GRAPHQL=1" \
    "CLAWQL_WORM_HTTP_PORT=${WORM_HTTP_PORT}" \
    "CLAWQL_AUDIT_API_KEY=${AUDIT_API_KEY}"

  # Expose WORM HTTP on the Service + allow same-ns ingress on that port.
  local svc
  svc="$(kubectl -n "${NS}" get svc -l "app=${MCP_DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"
  kubectl -n "${NS}" patch svc "${svc}" --type=json -p "[
    {\"op\":\"add\",\"path\":\"/spec/ports/-\",\"value\":{\"name\":\"worm-http\",\"port\":${WORM_HTTP_PORT},\"targetPort\":${WORM_HTTP_PORT}}}
  ]" 2>/dev/null || true

  local np
  np="$(kubectl -n "${NS}" get netpol -o name | grep default-deny | head -1 || true)"
  if [[ -n "${np}" ]]; then
    kubectl -n "${NS}" patch "${np}" --type=json -p "[
      {\"op\":\"add\",\"path\":\"/spec/ingress/0/ports/-\",\"value\":{\"protocol\":\"TCP\",\"port\":${WORM_HTTP_PORT}}}
    ]" 2>/dev/null || true
  fi

  kubectl -n "${NS}" rollout status "deployment/${MCP_DEPLOY}" --timeout=180s
  kubectl -n "${NS}" rollout status deployment/clawql-wire-sink --timeout=120s

  # Confirm JWKS serves a real key (empty keys would make every token 401).
  local jwks_body
  jwks_body="$(kubectl -n "${NS}" run clawql-jwks-check --rm -i --restart=Never \
    --image="${CURL_IMAGE}" --labels=clawql-kind-fixture=true -- \
    curl -sf "http://clawql-jwks.${NS}.svc.cluster.local/.well-known/jwks.json" 2>/dev/null || true)"
  if ! echo "${jwks_body}" | grep -q '"kid"'; then
    echo "D5 FAIL: JWKS fixture still empty — positive control would be vacuous" >&2
    echo "${jwks_body}" >&2
    return 1
  fi
  echo "D5: JWKS serves kid-bearing key"
}

# Build + kind-load wire-tests image (partial); signed mode also loads locally.
d5_build_wire_image() {
  echo "==> Build wire-tests image ${WIRE_IMAGE}"
  docker build -t "${WIRE_IMAGE}" -f "${ROOT}/docker/Dockerfile" --target wire-tests "${ROOT}"
  kind load docker-image "${WIRE_IMAGE}" --name "${CLUSTER_NAME}"
}

# Run remote wire Job; fail if Job fails or junit missing expected remote rows.
d5_run_wire_job() {
  echo "==> In-cluster wire rows 5/6/7/7b/9/11/12 (Job)"
  local mcp_svc mcp_port
  mcp_svc="$(kubectl -n "${NS}" get svc -l "app=${MCP_DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"
  mcp_port="$(kubectl -n "${NS}" get svc "${mcp_svc}" -o jsonpath='{.spec.ports[0].port}')"
  local base="http://${mcp_svc}.${NS}.svc.cluster.local:${mcp_port}"
  local audit="http://${mcp_svc}.${NS}.svc.cluster.local:${WORM_HTTP_PORT}"
  local sink="http://clawql-wire-sink.${NS}.svc.cluster.local:8080"
  local issuer="http://clawql-jwks.${NS}.svc.cluster.local"
  local aud="clawql-mcp"

  kubectl -n "${NS}" delete job clawql-wire-remote --ignore-not-found
  kubectl -n "${NS}" delete configmap clawql-wire-junit --ignore-not-found 2>/dev/null || true

  kubectl -n "${NS}" apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: clawql-wire-remote
  labels:
    clawql-kind-fixture: "true"
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        clawql-kind-fixture: "true"
        app: clawql-wire-remote
    spec:
      restartPolicy: Never
      containers:
        - name: wire
          image: ${WIRE_IMAGE}
          imagePullPolicy: Never
          env:
            - name: CLAWQL_WIRE_REQUIRED
              value: "1"
            - name: CLAWQL_WIRE_TARGET
              value: remote
            - name: CLAWQL_WIRE_BASE_URL
              value: "${base}"
            - name: CLAWQL_WIRE_AUDIT_URL
              value: "${audit}"
            - name: CLAWQL_WIRE_AUDIT_API_KEY
              value: "${AUDIT_API_KEY}"
            - name: CLAWQL_WIRE_SINK_URL
              value: "${sink}"
            - name: CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH
              value: /keys/private.pem
            - name: CLAWQL_WIRE_OIDC_ISSUER
              value: "${issuer}"
            - name: CLAWQL_WIRE_OIDC_AUDIENCE
              value: "${aud}"
            - name: CLAWQL_WIRE_OIDC_KID
              value: "${WIRE_OIDC_KID}"
          volumeMounts:
            - name: signing
              mountPath: /keys
              readOnly: true
          # Keep junit on an emptyDir so we can kubectl cp after.
          # The image CMD already writes /tmp/wire-junit.xml
      volumes:
        - name: signing
          secret:
            secretName: clawql-wire-signing
EOF

  set +e
  kubectl -n "${NS}" wait --for=condition=complete job/clawql-wire-remote --timeout=600s
  local wait_rc=$?
  set -e
  kubectl -n "${NS}" logs job/clawql-wire-remote --tail=200 | tee "${ARTIFACT_DIR}/wire-job.log" || true
  local pod
  pod="$(kubectl -n "${NS}" get pods -l job-name=clawql-wire-remote -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [[ -n "${pod}" ]]; then
    kubectl -n "${NS}" cp "${NS}/${pod}:/tmp/wire-junit.xml" "${ARTIFACT_DIR}/wire-junit.xml" 2>/dev/null || true
  fi
  if [[ "${wait_rc}" -ne 0 ]]; then
    echo "D5 FAIL: wire Job did not complete successfully" >&2
    kubectl -n "${NS}" describe job clawql-wire-remote >&2 || true
    return 1
  fi
  if [[ ! -f "${ARTIFACT_DIR}/wire-junit.xml" ]]; then
    echo "D5 FAIL: missing wire-junit.xml artifact" >&2
    return 1
  fi
  # Require the remote-critical test names to appear in junit.
  local need
  for need in "5) MCP auth" "6) valid token" "7) resume approve" "7b) resume decline" "9) webhook" "11) SSRF" "12) GET /chain/verify"; do
    if ! grep -Fq "${need}" "${ARTIFACT_DIR}/wire-junit.xml"; then
      echo "D5 FAIL: junit missing expected row: ${need}" >&2
      return 1
    fi
  done
  if grep -E 'failures="[1-9]|errors="[1-9]' "${ARTIFACT_DIR}/wire-junit.xml"; then
    echo "D5 FAIL: junit reports failures/errors" >&2
    return 1
  fi
  echo "D5 wire Job OK: remote rows present in junit"
}

# Row 8 via kubectl exec into the MCP pod (same CLAWQL_HOME=/vault).
d5_run_row8_cli() {
  echo "==> Row 8: kubectl exec clawql resume approve (regulated refuse)"
  local pod mcp_svc exec_id
  pod="$(kubectl -n "${NS}" get pods -l "app=${MCP_DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"
  mcp_svc="$(kubectl -n "${NS}" get svc -l "app=${MCP_DEPLOY}" -o jsonpath='{.items[0].metadata.name}')"

  kubectl -n "${NS}" delete job clawql-row8-park --ignore-not-found >/dev/null 2>&1 || true
  kubectl -n "${NS}" apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: clawql-row8-park
  labels:
    clawql-kind-fixture: "true"
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        clawql-kind-fixture: "true"
    spec:
      restartPolicy: Never
      containers:
        - name: park
          image: ${WIRE_IMAGE}
          imagePullPolicy: Never
          command: ["node", "--input-type=module", "/app/scripts/kubernetes/regulated-kind-row8-park.mjs"]
          env:
            - name: CLAWQL_WIRE_BASE_URL
              value: "http://${mcp_svc}.${NS}.svc.cluster.local:8080"
            - name: CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH
              value: /keys/private.pem
            - name: CLAWQL_WIRE_OIDC_ISSUER
              value: "http://clawql-jwks.${NS}.svc.cluster.local"
            - name: CLAWQL_WIRE_OIDC_AUDIENCE
              value: clawql-mcp
            - name: CLAWQL_WIRE_OIDC_KID
              value: "${WIRE_OIDC_KID}"
          volumeMounts:
            - name: signing
              mountPath: /keys
              readOnly: true
      volumes:
        - name: signing
          secret:
            secretName: clawql-wire-signing
EOF
  kubectl -n "${NS}" wait --for=condition=complete job/clawql-row8-park --timeout=180s
  exec_id="$(kubectl -n "${NS}" logs job/clawql-row8-park | sed -n 's/^EXECUTION_ID=//p' | tail -1)"
  if [[ -z "${exec_id}" ]]; then
    echo "Row 8 FAIL: could not park execution" >&2
    kubectl -n "${NS}" logs job/clawql-row8-park >&2 || true
    return 1
  fi
  echo "Row 8 parked ${exec_id}"

  set +e
  local cli_out cli_rc
  cli_out="$(kubectl -n "${NS}" exec "${pod}" -- \
    /usr/local/bin/bun --smol /app/bin/clawql.mjs resume "${exec_id}" 2>&1)"
  cli_rc=$?
  set -e
  echo "${cli_out}" | tee "${ARTIFACT_DIR}/row8-cli.log"
  if [[ "${cli_rc}" -eq 0 ]]; then
    echo "Row 8 FAIL: CLI approve exited 0 under regulated" >&2
    return 1
  fi
  if ! echo "${cli_out}" | grep -Eiq 'CLAWQL_TIER=regulated refuses CLI approve|regulated refuses CLI approve.*console'; then
    echo "Row 8 FAIL: CLI output missing regulated refuse message" >&2
    return 1
  fi
  echo "Row 8 OK: CLI approve refused under regulated; still pending"
}
