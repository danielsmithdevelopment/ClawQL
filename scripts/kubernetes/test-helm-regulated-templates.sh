#!/usr/bin/env bash
# Regulated chart render checks (D2b / H3 / H5).
# - Each weakened flag via extraEnvAppend must fail render.
# - Missing envFromSecret must fail (secretSourcing.requireVaultBackedSecrets).
# - values-regulated.yaml + kind overlay must render.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

CHART="manifests/charts/clawql-mcp"
REG="${CHART}/values-regulated.yaml"
KIND="${CHART}/ci/values-regulated-kind.yaml"
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

must_fail() {
  local label="$1"
  shift
  set +e
  helm template reg-fail "${CHART}" "$@" >"${TMP}" 2>"${TMP}.err"
  local rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    echo "ERROR: expected render failure for ${label}" >&2
    cat "${TMP}.err" >&2 || true
    exit 1
  fi
  if ! grep -Eiq 'Error:|fail|refuses|requires|weakened' "${TMP}.err"; then
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
  must_fail "${name}=0" \
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
  must_fail "${name}=1" \
    -f "${REG}" \
    --set-string "extraEnvAppend[0].name=${name}" \
    --set-string "extraEnvAppend[0].value=1" \
    --set-string "envFromSecret=clawql-provider-env"
done

echo "==> H5: regulated without envFromSecret must fail"
must_fail "missing envFromSecret" -f "${REG}" --set envFromSecret=

echo "==> regulated + kind overlay must render"
helm template reg-ok "${CHART}" \
  -f "${REG}" \
  -f "${KIND}" >"${TMP}"

python3 - "${TMP}" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8").read()
checks = [
    (r"CLAWQL_TIER", "CLAWQL_TIER present"),
    (r"CLAWQL_WORM_ENABLED", "WORM_ENABLED present"),
    (r"CLAWQL_INFERENCE_LOCAL_ONLY", "INFERENCE_LOCAL_ONLY present"),
    (r"kind: NetworkPolicy", "NetworkPolicy rendered"),
]
for pattern, msg in checks:
    if re.search(pattern, text) is None:
        print(f"ERROR: missing {msg}")
        sys.exit(1)
# Kind overlay turns Kata / Kyverno signature off; gRPC TLS may be on.
print("OK: regulated + kind overlay rendered")
PY

echo "helm-regulated-template-tests OK"
