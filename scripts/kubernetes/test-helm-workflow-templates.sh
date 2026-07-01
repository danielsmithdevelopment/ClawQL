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
  --set enableWorkflow=true \
  --set 'workflow.namespaceAllowlist={clawql,pipelines}' \
  --set workflow.defaultNamespace=clawql \
  --set workflow.notifyOnTerminal=true \
  --set workflow.notifyChannel=CTEST \
  --set workflow.allowDelete=true >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false >"${TMP_DISABLED}"

python3 - "${TMP_ENABLED}" "${TMP_DISABLED}" <<'PY'
import re
import sys

enabled_path, disabled_path = sys.argv[1], sys.argv[2]
enabled = open(enabled_path, "r", encoding="utf-8").read()
disabled = open(disabled_path, "r", encoding="utf-8").read()

checks = [
    (r"name: CLAWQL_ENABLE_WORKFLOW\n\s+value: \"1\"", "CLAWQL_ENABLE_WORKFLOW env"),
    (
        r"name: CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST\n\s+value: \"clawql,pipelines\"",
        "namespace allowlist env",
    ),
    (
        r"name: CLAWQL_WORKFLOW_DEFAULT_NAMESPACE\n\s+value: \"clawql\"",
        "default namespace env",
    ),
    (
        r"name: CLAWQL_WORKFLOW_NOTIFY_ON_TERMINAL\n\s+value: \"1\"",
        "notify on terminal env",
    ),
    (
        r"name: CLAWQL_WORKFLOW_NOTIFY_CHANNEL\n\s+value: \"CTEST\"",
        "notify channel env",
    ),
    (
        r"name: CLAWQL_WORKFLOW_ALLOW_DELETE\n\s+value: \"1\"",
        "allow delete env",
    ),
    (r"name: clawql-mcp-http-workflow", "workflow Role name"),
    (r"- update", "workflow update RBAC for suspend/resume"),
    (r"clusterworkflowtemplates", "ClusterWorkflowTemplate read RBAC"),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: missing {message}")
        sys.exit(1)

if "CLAWQL_ENABLE_WORKFLOW" in disabled:
    print("ERROR: workflow env rendered when enableWorkflow=false")
    sys.exit(1)
if "clawql-mcp-http-workflow" in disabled:
    print("ERROR: workflow RBAC rendered when enableWorkflow=false")
    sys.exit(1)
PY

echo "helm-workflow-template-tests OK"
