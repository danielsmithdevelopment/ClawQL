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
    # Helm | quote → YAML double-quoted JSON string literal
    return json.loads(json.loads(m.group(1)))


enabled_spec = instance_spec(enabled)
disabled_spec = instance_spec(disabled)

if enabled_spec.get("automation", {}).get("workflow", {}).get("enabled") is not True:
    print("ERROR: missing automation.workflow.enabled=true in CLAWQL_INSTANCE_SPEC")
    sys.exit(1)
if disabled_spec.get("automation", {}).get("workflow", {}).get("enabled") is True:
    print("ERROR: workflow enabled in CLAWQL_INSTANCE_SPEC when enableWorkflow=false")
    sys.exit(1)

checks = [
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
    (r"cronworkflows", "CronWorkflow RBAC"),
    (r"clusterworkflowtemplates", "ClusterWorkflowTemplate read RBAC"),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: missing {message}")
        sys.exit(1)

# MCP deployment must not dual-write CLAWQL_ENABLE_WORKFLOW (composition via INSTANCE_SPEC).
if re.search(
    r"name: CLAWQL_ENABLE_WORKFLOW\n\s+value: \"1\"",
    enabled,
    flags=re.MULTILINE,
):
    # nats-worker may still set it when worker+workflow are on; default enable path should not.
    # Ensure the main container env block relies on INSTANCE_SPEC only: fail if ENABLE appears
    # without a nats-worker deployment in this render (defaults: worker off).
    if "app.kubernetes.io/component: nats-worker" not in enabled:
        print("ERROR: CLAWQL_ENABLE_WORKFLOW dual-written on MCP deployment")
        sys.exit(1)

if "clawql-mcp-http-workflow" in disabled:
    print("ERROR: workflow RBAC rendered when enableWorkflow=false")
    sys.exit(1)
PY

echo "helm-workflow-template-tests OK"
