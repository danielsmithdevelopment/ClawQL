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
  --set kyverno.imageSignaturePolicy.enabled=false \
  --set documentPipeline.enabled=true \
  --set documentPipeline.docling.enabled=true \
  --set providerIngress.enabled=true \
  --set providerIngress.docling.enabled=true >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  --set documentPipeline.enabled=true \
  --set documentPipeline.docling.enabled=false >"${TMP_DISABLED}"

python3 - "${TMP_ENABLED}" "${TMP_DISABLED}" <<'PY'
import re
import sys

enabled_path, disabled_path = sys.argv[1], sys.argv[2]
enabled = open(enabled_path, "r", encoding="utf-8").read()
disabled = open(disabled_path, "r", encoding="utf-8").read()

checks = [
    (r"app\.kubernetes\.io/component: docling", "docling Deployment labels"),
    (r"quay\.io/docling-project/docling-serve-cpu", "docling image"),
    (r"path: /health", "docling health probe"),
    (r"name: DOCLING_BASE_URL", "MCP DOCLING_BASE_URL env"),
    (r"name: clawql-mcp-http-docling", "docling Service name (fullnameOverride)"),
    (r'host: "?docling\.localhost"?', "docling Ingress host"),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: missing {message}")
        sys.exit(1)

if "app.kubernetes.io/component: docling" in disabled:
    print("ERROR: docling rendered when documentPipeline.docling.enabled=false")
    sys.exit(1)

PY

echo "helm-docling-template-tests OK"
