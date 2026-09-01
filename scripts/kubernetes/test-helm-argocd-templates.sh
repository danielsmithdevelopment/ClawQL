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
  --set enableArgoCd=true \
  --set 'argocd.namespaceAllowlist={argocd}' \
  --set argocd.defaultNamespace=argocd \
  --set argocd.allowSync=true >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false >"${TMP_DISABLED}"

python3 - "${TMP_ENABLED}" "${TMP_DISABLED}" <<'PY'
import json
import re
import sys

enabled_path, disabled_path = sys.argv[1], sys.argv[2]
enabled = open(enabled_path, "r", encoding="utf-8").read()
disabled = open(disabled_path, "r", encoding="utf-8").read()


def instance_spec(manifest: str) -> dict:
    m = re.search(
        r'name: CLAWQL_INSTANCE_SPEC\n\s+value: ("(?:\\.|[^"\\])*")\n',
        manifest,
    )
    if not m:
        raise SystemExit("ERROR: missing CLAWQL_INSTANCE_SPEC env")
    return json.loads(json.loads(m.group(1)))


enabled_spec = instance_spec(enabled)
disabled_spec = instance_spec(disabled)

if enabled_spec.get("automation", {}).get("argocd", {}).get("enabled") is not True:
    print("ERROR: missing automation.argocd.enabled=true in CLAWQL_INSTANCE_SPEC")
    sys.exit(1)
if disabled_spec.get("automation", {}).get("argocd", {}).get("enabled") is True:
    print("ERROR: argocd enabled in CLAWQL_INSTANCE_SPEC when enableArgoCd=false")
    sys.exit(1)

checks = [
    (
        r"name: CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST\n\s+value: \"argocd\"",
        "argocd namespace allowlist env",
    ),
    (r"name: CLAWQL_ARGO_CD_ALLOW_SYNC\n\s+value: \"1\"", "argocd allow sync env"),
    (r"name: clawql-mcp-http-argocd", "argocd Role name"),
    (r"resources: \[\"applications\"\]", "applications RBAC"),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: missing {message}")
        sys.exit(1)

if re.search(r"name: CLAWQL_ENABLE_ARGO_CD\n\s+value: \"1\"", enabled, flags=re.MULTILINE):
    print("ERROR: CLAWQL_ENABLE_ARGO_CD dual-written on MCP deployment")
    sys.exit(1)
if "clawql-mcp-http-argocd" in disabled:
    print("ERROR: argocd RBAC rendered when enableArgoCd=false")
    sys.exit(1)
PY

echo "helm-argocd-template-tests OK"
