#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_ENABLED="$(mktemp)"
TMP_DISABLED="$(mktemp)"
TMP_IDP="$(mktemp)"
trap 'rm -f "${TMP_ENABLED}" "${TMP_DISABLED}" "${TMP_IDP}"' EXIT

_LINT_SECRET=(--set envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  --set nats.enabled=true \
  --set nats.appIntegration.publish=true \
  --set nats.worker.enabled=true \
  --set nats.keda.enabled=true \
  --set enableWorkflow=true \
  --set 'workflow.namespaceAllowlist={clawql}' >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false >"${TMP_DISABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  -f charts/clawql-mcp/values-nats-idp.example.yaml \
  --set nats.keda.enabled=true >"${TMP_IDP}"

python3 - "${TMP_ENABLED}" "${TMP_DISABLED}" "${TMP_IDP}" <<'PY'
import re
import sys

enabled_path, disabled_path, idp_path = sys.argv[1], sys.argv[2], sys.argv[3]
enabled = open(enabled_path, "r", encoding="utf-8").read()
disabled = open(disabled_path, "r", encoding="utf-8").read()
idp = open(idp_path, "r", encoding="utf-8").read()

if enabled.count("CLAWQL_NATS_ENABLE_CONSUMER") != 1:
    print("ERROR: expected exactly one CLAWQL_NATS_ENABLE_CONSUMER (worker only)")
    sys.exit(1)

mcp_deploy = enabled.split("# Source: clawql-mcp/templates/deployment.yaml", 1)[1].split("# Source:", 1)[0]
if "CLAWQL_NATS_ENABLE_CONSUMER" in mcp_deploy:
    print("ERROR: MCP deployment must not embed consumer when nats.worker.enabled")
    sys.exit(1)

checks = [
    (r"name: clawql-mcp-http-nats-worker\n", "nats worker Deployment"),
    (r"node_modules/clawql-automation/dist/nats/cli.js", "worker CLI command"),
    (r"kind: ScaledObject", "KEDA ScaledObject"),
    (r"type: nats-jetstream", "KEDA NATS JetStream trigger"),
    (r'stream: "CLAWQL_WORKFLOW"', "KEDA stream name"),
    (r'consumer: "clawql-hitl-resume"', "KEDA consumer name"),
    (r"bootstrap-cli.js", "consumer bootstrap Job"),
    (r"name: CLAWQL_NATS_ENABLE_PUBLISH\n\s+value: \"1\"", "MCP publish env"),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: missing {message}")
        sys.exit(1)

if "ScaledObject" in disabled:
    print("ERROR: KEDA rendered when worker/keda disabled")
    sys.exit(1)
if "nats-worker" in disabled:
    print("ERROR: nats worker rendered when disabled")
    sys.exit(1)

idp_checks = [
    (r"CLAWQL_NATS_CONSUMER_IDP_PIPELINE", "idp pipeline consumer"),
    (r"CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP", "coneshare followup consumer"),
    (r'consumer: "clawql-idp-pipeline"', "KEDA idp-pipeline trigger"),
    (r'consumer: "clawql-coneshare-followup"', "KEDA coneshare trigger"),
]
for pattern, message in idp_checks:
    if re.search(pattern, idp) is None:
        print(f"ERROR: IDP values missing {message}")
        sys.exit(1)

PY

echo "helm-nats-keda-template-tests OK"
