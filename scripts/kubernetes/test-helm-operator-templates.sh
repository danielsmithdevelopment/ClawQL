#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

helm template test charts/clawql-operator --namespace clawql-system >"${TMP}"

python3 - "${TMP}" <<'PY'
import sys

text = open(sys.argv[1], "r", encoding="utf-8").read()
checks = [
    ("CustomResourceDefinition", "CRD"),
    ("kind: Deployment", "operator Deployment"),
    ("clawqlinstances.clawql.io", "CRD group/name"),
    ("kind: ClusterRole", "RBAC"),
    ("deployments", "MCP rollout RBAC"),
]
for needle, label in checks:
    if needle not in text:
        print(f"ERROR: missing {label}")
        sys.exit(1)
print("helm-operator-template-tests OK")
PY

helm template test charts/clawql-mcp --namespace clawql \
  --set envFromSecret=clawql-lint-provider-env \
  --set instanceSpec.enabled=true \
  --set instanceSpec.configMapName=clawql-tier-spec \
  | rg -q 'CLAWQL_INSTANCE_SPEC_FILE'

echo "helm-mcp-instance-spec-mount OK"
