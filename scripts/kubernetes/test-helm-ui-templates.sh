#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_ENABLED="$(mktemp)"
TMP_DISABLED="$(mktemp)"
trap 'rm -f "${TMP_ENABLED}" "${TMP_DISABLED}"' EXIT

# satisfy secretSourcing.requireVaultBackedSecrets (same lint stub name as Makefile helm-lint)
_LINT_SECRET=(--set envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set ui.enabled=true \
  --set ui.ingress.enabled=true \
  --set dashboard.enabled=true \
  --set dashboard.ingress.enabled=true \
  --set dashboard.openclawChatUrl=http://openclaw.clawql.svc.cluster.local:8787/v1/chat >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" >"${TMP_DISABLED}"

python3 - "${TMP_ENABLED}" "${TMP_DISABLED}" <<'PY'
import re
import sys

enabled_path, disabled_path = sys.argv[1], sys.argv[2]
enabled = open(enabled_path, "r", encoding="utf-8").read()
disabled = open(disabled_path, "r", encoding="utf-8").read()

checks = [
    (r"(?m)^kind: Deployment$", "expected Deployment when ui.enabled=true"),
    (r"(?m)^  name: clawql-mcp-http-ui$", "expected UI resource name"),
    (r"(?m)^kind: Service$", "expected Service when ui.enabled=true"),
    (r"(?m)^kind: Ingress$", "expected Ingress when ui.ingress.enabled=true"),
    (r"(?m)^  ingressClassName: nginx$", "expected ingress class nginx"),
    (r'host: "docs\.localhost"', "expected docs.localhost ingress host"),
    (
        r"service:\n\s+name: clawql-mcp-http-ui",
        "expected ingress backend to route to UI service",
    ),
    (r"(?m)^  name: clawql-mcp-http-dashboard$", "expected dashboard resource name"),
    (r'host: "clawql\.localhost"', "expected clawql.localhost dashboard ingress host"),
    (
        r"service:\n\s+name: clawql-mcp-http-dashboard",
        "expected ingress backend to route to dashboard service",
    ),
    (
        r"name: CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL\n\s+value: \"http://openclaw\.clawql\.svc\.cluster\.local:8787/v1/chat\"",
        "expected dashboard deployment to include CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL when set",
    ),
]

for pattern, message in checks:
    if re.search(pattern, enabled, flags=re.MULTILINE) is None:
        print(f"ERROR: {message}")
        sys.exit(1)

if "clawql-mcp-http-ui" in disabled:
    print("ERROR: UI resources rendered unexpectedly when ui.enabled=false")
    sys.exit(1)
if "clawql-mcp-http-dashboard" in disabled:
    print("ERROR: dashboard resources rendered unexpectedly when dashboard.enabled=false")
    sys.exit(1)
if "CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL" in disabled:
    print("ERROR: CLAWQL_DASHBOARD_OPENCLAW_CHAT_URL rendered unexpectedly in default template")
    sys.exit(1)
PY

echo "helm-ui-template-tests OK"
