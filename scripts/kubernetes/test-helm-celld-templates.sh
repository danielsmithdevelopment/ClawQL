#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_CELLD="$(mktemp)"
TMP_OFF="$(mktemp)"
TMP_ADAPTER="$(mktemp)"
trap 'rm -f "${TMP_CELLD}" "${TMP_OFF}" "${TMP_ADAPTER}"' EXIT

_LINT_SECRET=(--set envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  -f charts/clawql-mcp/values-streams-celld.example.yaml \
  --set streams.celld.bucket=s3://lint-clawql-streams-state \
  --set streams.celld.endpoint=https://lint.r2.cloudflarestorage.com \
  >"${TMP_CELLD}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  >"${TMP_OFF}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  -f charts/clawql-mcp/values-streams-celld.example.yaml \
  --set streams.celld.bucket=s3://lint-clawql-streams-state \
  --set streams.celld.endpoint=https://lint.r2.cloudflarestorage.com \
  --set streams.celld.adapterUrl=http://mcp-api-adapter.clawql.svc.cluster.local:8090 \
  >"${TMP_ADAPTER}"

python3 - "${TMP_CELLD}" "${TMP_OFF}" "${TMP_ADAPTER}" <<'PY'
import sys

celld_path, off_path, adapter_path = sys.argv[1], sys.argv[2], sys.argv[3]
celld = open(celld_path, "r", encoding="utf-8").read()
off = open(off_path, "r", encoding="utf-8").read()
adapter = open(adapter_path, "r", encoding="utf-8").read()

assert "kind: StatefulSet" in celld
assert "streams-celld" in celld
assert "path: /.well-known/celld/health" in celld
assert "CLAWQL_ENABLE_STREAMS" in celld
assert "CELLD_ADVERTISE" in celld
assert "ghcr.io/denoland/celld:v0.4.0" in celld
assert "CLAWQL_MCP_URL" in celld
assert "INFERENCE_URL" in celld
assert "/mcp" in celld
assert "CLAWQL_MCP_ADAPTER_URL" not in celld

assert "streams-celld" not in off
assert "CELLD_ADVERTISE" not in off
assert "CLAWQL_ENABLE_STREAMS" not in off

assert "CLAWQL_MCP_ADAPTER_URL" in adapter
assert "mcp-api-adapter.clawql.svc.cluster.local:8090" in adapter

print("helm celld templates OK")
PY

echo "test-helm-celld-templates: PASS"
