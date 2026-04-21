#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

TMP_ENABLED="$(mktemp)"
TMP_DISABLED="$(mktemp)"
trap 'rm -f "${TMP_ENABLED}" "${TMP_DISABLED}"' EXIT

helm template test charts/clawql-mcp --namespace clawql \
  --set ui.enabled=true \
  --set ui.ingress.enabled=true >"${TMP_ENABLED}"

helm template test charts/clawql-mcp --namespace clawql >"${TMP_DISABLED}"

# UI enabled: assert Deployment + Service + Ingress render as expected.
rg --quiet "^kind: Deployment$" "${TMP_ENABLED}"
rg --quiet "^  name: clawql-mcp-http-ui$" "${TMP_ENABLED}"
rg --quiet "^kind: Service$" "${TMP_ENABLED}"
rg --quiet "^kind: Ingress$" "${TMP_ENABLED}"
rg --quiet "^  ingressClassName: nginx$" "${TMP_ENABLED}"
rg --quiet "host: \"clawql.localhost\"" "${TMP_ENABLED}"
rg --quiet "service:\\n\\s+name: clawql-mcp-http-ui" "${TMP_ENABLED}" --multiline

# UI disabled by default: no UI resources should be rendered.
if rg --quiet "clawql-mcp-http-ui" "${TMP_DISABLED}"; then
  echo "ERROR: UI resources rendered unexpectedly when ui.enabled=false"
  exit 1
fi

echo "helm-ui-template-tests OK"
