#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

helm dependency update charts/clawql-idp >/dev/null

TMP_LEAN="$(mktemp)"
TMP_FULL="$(mktemp)"
trap 'rm -f "${TMP_LEAN}" "${TMP_FULL}"' EXIT

_LINT_SECRET=(--set clawql-mcp.envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-idp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set clawql-mcp.kyverno.imageSignaturePolicy.enabled=false \
  >"${TMP_LEAN}"

helm template test charts/clawql-idp --namespace clawql \
  -f charts/clawql-idp/values-idp-full.yaml \
  "${_LINT_SECRET[@]}" \
  --set clawql-mcp.kyverno.imageSignaturePolicy.enabled=false \
  --set-string clawql-mcp.openclaw.gatewayToken=helm-idp-test-token \
  >"${TMP_FULL}"

python3 - "${TMP_LEAN}" "${TMP_FULL}" <<'PY'
import re
import sys

lean_path, full_path = sys.argv[1], sys.argv[2]
lean = open(lean_path, "r", encoding="utf-8").read()
full = open(full_path, "r", encoding="utf-8").read()

# Lean profile: MCP deployment renders, workflow off
if "kind: Deployment" not in lean:
    print("ERROR: lean profile missing Deployment")
    sys.exit(1)
if "CLAWQL_ENABLE_WORKFLOW" in lean:
    print("ERROR: lean profile should not enable workflow")
    sys.exit(1)

# Full profile: workflow + argocd + notify
full_checks = [
    (r'name: CLAWQL_ENABLE_WORKFLOW\n\s+value: "1"', "workflow enabled"),
    (r'name: CLAWQL_ENABLE_ARGO_CD\n\s+value: "1"', "argocd enabled"),
    (r'name: CLAWQL_ENABLE_NOTIFY\n\s+value: "1"', "notify enabled"),
    (r"document-pipeline", "document pipeline stack"),
    (r"openclaw", "openclaw resources"),
]
for pattern, message in full_checks:
    if re.search(pattern, full, flags=re.MULTILINE | re.IGNORECASE) is None:
        print(f"ERROR: full profile missing {message}")
        sys.exit(1)

print("helm-idp-template-tests OK")
PY
