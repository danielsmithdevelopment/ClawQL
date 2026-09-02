#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_CELLD="$(mktemp)"
TMP_OFF="$(mktemp)"
trap 'rm -f "${TMP_CELLD}" "${TMP_OFF}"' EXIT

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

python3 - "${TMP_CELLD}" "${TMP_OFF}" <<'PY'
import sys

celld_path, off_path = sys.argv[1], sys.argv[2]
celld = open(celld_path, "r", encoding="utf-8").read()
off = open(off_path, "r", encoding="utf-8").read()

assert "kind: StatefulSet" in celld
assert "clawql-mcp-celld" in celld
assert "path: /.well-known/celld/health" in celld
assert "CLAWQL_ENABLE_STREAMS" in celld
assert "CELLD_ADVERTISE" in celld
assert "ghcr.io/denoland/celld:v0.4.0" in celld

assert "kind: StatefulSet" not in off or "streams-celld" not in off
assert "CLAWQL_ENABLE_STREAMS" not in off

print("helm celld templates OK")
PY

echo "test-helm-celld-templates: PASS"
