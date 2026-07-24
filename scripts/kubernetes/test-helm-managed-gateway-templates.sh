#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_ENABLED="$(mktemp)"
TMP_DISABLED="$(mktemp)"
trap 'rm -f "${TMP_ENABLED}" "${TMP_DISABLED}"' EXIT

_LINT_SECRET=(--set envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set inference.enabled=true \
  --set managedGateway.enabled=true \
  --set inference.home.enabled=true \
  --set inference.home.existingClaim=clawql-home-pvc \
  >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" >"${TMP_DISABLED}"

python3 - "${TMP_ENABLED}" "${TMP_DISABLED}" <<'PY'
import re
import sys

enabled_path, disabled_path = sys.argv[1], sys.argv[2]
enabled = open(enabled_path, "r", encoding="utf-8").read()
disabled = open(disabled_path, "r", encoding="utf-8").read()

checks = [
    (r"(?m)^  name: clawql-mcp-http-inference$", "expected inference Deployment/Service name"),
    (r"(?m)^  name: clawql-mcp-http-managed-gateway$", "expected managed-gateway Deployment/Service name"),
    (r"(?m)^  name: clawql-mcp-http-managed-gateway-config$", "expected managed-gateway ConfigMap"),
    (r"app\.kubernetes\.io/component: inference", "expected inference component label"),
    (r"app\.kubernetes\.io/component: managed-gateway", "expected managed-gateway component label"),
    (r"packages/clawql-inference/bin/clawql-inference\.mjs", "expected inference command"),
    (r"CLAWQL_INFERENCE_KEYS_ENABLED", "expected keys-enabled env on inference"),
    (r"location /mcp", "expected /mcp route in managed gateway nginx"),
    (r"location /v1/", "expected /v1/ route in managed gateway nginx"),
    (r"clawql-mcp-http-inference\.clawql\.svc\.cluster\.local", "expected inference upstream DNS"),
    (r"claimName: clawql-home-pvc", "expected shared home PVC mount"),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: {message}")
        sys.exit(1)

for name in (
    "clawql-mcp-http-inference",
    "clawql-mcp-http-managed-gateway",
    "clawql-mcp-http-managed-gateway-config",
):
    if name in disabled:
        print(f"ERROR: {name} rendered unexpectedly when inference/managedGateway disabled")
        sys.exit(1)
PY

echo "helm-managed-gateway-template-tests OK"
