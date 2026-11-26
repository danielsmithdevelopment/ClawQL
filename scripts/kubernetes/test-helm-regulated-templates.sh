#!/usr/bin/env bash
# Regulated chart render checks (D2b / H3 / H5 + D3 L1/L2/L4).
# - Each weakened flag via extraEnvAppend must fail render.
# - Missing envFromSecret must fail specifically on requireVaultBackedSecrets (L1).
# - values-regulated.yaml + kind overlay must render with expected env values (L4).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

CHART="manifests/charts/clawql-mcp"
REG="${CHART}/values-regulated.yaml"
KIND="${CHART}/ci/values-regulated-kind.yaml"
TMP="$(mktemp)"
trap 'rm -f "${TMP}" "${TMP}.err"' EXIT

must_fail() {
  local label="$1"
  local expect_re="${2:-}"
  shift 2
  set +e
  helm template reg-fail "${CHART}" "$@" >"${TMP}" 2>"${TMP}.err"
  local rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    echo "ERROR: expected render failure for ${label}" >&2
    cat "${TMP}.err" >&2 || true
    exit 1
  fi
  if [[ -n "$expect_re" ]]; then
    if ! grep -Eiq "$expect_re" "${TMP}.err"; then
      echo "ERROR: ${label} failed but stderr does not match /${expect_re}/:" >&2
      cat "${TMP}.err" >&2 || true
      exit 1
    fi
  elif ! grep -Eiq 'Error:|fail|refuses|requires|weakened' "${TMP}.err"; then
    echo "ERROR: ${label} failed without a clear chart error:" >&2
    cat "${TMP}.err" >&2 || true
    exit 1
  fi
  # When label is FLAG=value, require the flag name in the chart error.
  if [[ "$label" == *=* ]]; then
    local flag="${label%%=*}"
    if ! grep -Fq "$flag" "${TMP}.err"; then
      echo "ERROR: ${label} failed but stderr does not mention ${flag}:" >&2
      cat "${TMP}.err" >&2 || true
      exit 1
    fi
  fi
  echo "OK refuse: ${label}"
}

echo "==> H3: each weakened regulated flag must fail render"
MUST_ONE=(
  CLAWQL_WORM_ENABLED
  CLAWQL_WORM_REQUIRED
  CLAWQL_WORM_S3_VERIFY_OBJECT_LOCK
  CLAWQL_INFERENCE_LOCAL_ONLY
  CLAWQL_INFERENCE_KEYS_ENABLED
  CLAWQL_PANGUARD_PROXY_PLUGIN
  CLAWQL_PANGUARD_IN_PROCESS
)
for name in "${MUST_ONE[@]}"; do
  # --set-string: bare --set value=0 is dropped by Helm as empty.
  must_fail "${name}=0" "weakened ${name}|refuses weakened ${name}" \
    -f "${REG}" \
    --set-string "extraEnvAppend[0].name=${name}" \
    --set-string "extraEnvAppend[0].value=0" \
    --set-string "envFromSecret=clawql-provider-env"
done

MUST_OFF=(
  CLAWQL_ALLOW_NO_ENFORCEMENT
  CLAWQL_ALLOW_UNAUTHENTICATED
  CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED
  CLAWQL_HTTP_GRAPHQL
  CLAWQL_SOURCES_ALLOW_HTTP
)
for name in "${MUST_OFF[@]}"; do
  must_fail "${name}=1" "refuses truthy ${name}|truthy ${name}" \
    -f "${REG}" \
    --set-string "extraEnvAppend[0].name=${name}" \
    --set-string "extraEnvAppend[0].value=1" \
    --set-string "envFromSecret=clawql-provider-env"
done

echo "==> L2: padded truthy must-off value must also fail"
must_fail "CLAWQL_HTTP_GRAPHQL= 1" "refuses truthy CLAWQL_HTTP_GRAPHQL|truthy CLAWQL_HTTP_GRAPHQL" \
  -f "${REG}" \
  --set-string "extraEnvAppend[0].name=CLAWQL_HTTP_GRAPHQL" \
  --set-string "extraEnvAppend[0].value= 1" \
  --set-string "envFromSecret=clawql-provider-env"

echo "==> H5/L1: regulated without envFromSecret must fail on requireVaultBackedSecrets"
must_fail "missing envFromSecret" "requireVaultBackedSecrets|envFromSecret or envFromSecrets" \
  -f "${REG}" --set envFromSecret=

echo "==> regulated + kind overlay must render (L4: assert values)"
helm template reg-ok "${CHART}" \
  -f "${REG}" \
  -f "${KIND}" >"${TMP}"

python3 - "${TMP}" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()

def env_value(name: str) -> str | None:
    # Match env list entries: - name: FOO\n  value: "1"
    m = re.search(
        rf"- name: {re.escape(name)}\n\s+value: \"([^\"]*)\"",
        text,
    )
    return m.group(1) if m else None

must_one = [
    "CLAWQL_WORM_ENABLED",
    "CLAWQL_WORM_REQUIRED",
    "CLAWQL_WORM_S3_VERIFY_OBJECT_LOCK",
    "CLAWQL_INFERENCE_LOCAL_ONLY",
    "CLAWQL_INFERENCE_KEYS_ENABLED",
    "CLAWQL_PANGUARD_PROXY_PLUGIN",
    "CLAWQL_PANGUARD_IN_PROCESS",
]
for name in must_one:
    val = env_value(name)
    if val != "1":
        print(f"ERROR: L4 expected {name}=\"1\", got {val!r}")
        sys.exit(1)

if "kind: NetworkPolicy" not in text:
    print("ERROR: missing NetworkPolicy")
    sys.exit(1)
if re.search(r"name: CLAWQL_TIER\n\s+value: \"regulated\"", text) is None:
    print("ERROR: CLAWQL_TIER=regulated missing")
    sys.exit(1)

print("OK: regulated + kind overlay rendered with expected env values")
PY

echo "==> regulated + signed kind overlay must render"
helm template reg-signed "${CHART}" \
  -f "${REG}" \
  -f "${CHART}/ci/values-regulated-kind-signed.yaml" >"${TMP}"
python3 - "${TMP}" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
if "ClusterPolicy" not in text and "verify-clawql-images" not in text:
    # Policy is a pre-install hook; still expect Cosign subject in rendered objects or values path.
    if "docker-publish.yml" not in text and "subjectRegExp" not in text:
        # helm template may omit hooks depending on flags — require ghcr image at least.
        if "ghcr.io/danielsmithdevelopment/clawql-mcp" not in text:
            print("ERROR: signed overlay did not render GHCR clawql-mcp image")
            sys.exit(1)
if re.search(r"name: CLAWQL_WORM_ENABLED\n\s+value: \"1\"", text) is None:
    print("ERROR: signed overlay lost CLAWQL_WORM_ENABLED=1")
    sys.exit(1)
print("OK: regulated + signed kind overlay rendered")
PY

echo "helm-regulated-template-tests OK"
