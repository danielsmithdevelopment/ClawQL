#!/usr/bin/env bash
# Assert teamSync Helm values render expected CLAWQL_SYNC_* env on MCP Deployment.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

helm template test "${ROOT}/charts/clawql-mcp" --namespace clawql \
  --set envFromSecret=clawql-lint-provider-env \
  --set teamSync.enabled=true \
  --set teamSync.bucket=acme-team-clawql \
  --set teamSync.prefix=teams/demo/ \
  --set teamSync.autoPush=true \
  --set teamSync.autoPull=true \
  --set teamSync.r2.accountId=abc123 \
  >"${TMP}"

grep -q 'name: CLAWQL_SYNC_BUCKET' "${TMP}"
grep -q 'value: acme-team-clawql' "${TMP}"
grep -q 'name: CLAWQL_SYNC_AUTO' "${TMP}"
grep -q 'name: CLAWQL_SYNC_AUTO_PULL' "${TMP}"
grep -q 'name: CLAWQL_R2_ACCOUNT_ID' "${TMP}"
grep -q 'value: abc123' "${TMP}"

TMP_GCS="$(mktemp)"
trap 'rm -f "${TMP}" "${TMP_GCS}"' EXIT

helm template test "${ROOT}/charts/clawql-mcp" --namespace clawql \
  --set envFromSecret=clawql-lint-provider-env \
  --set teamSync.enabled=true \
  --set teamSync.provider=gcs \
  --set teamSync.bucket=acme-gcs-clawql \
  --set teamSync.prefix=teams/gcp/ \
  >"${TMP_GCS}"

grep -q 'name: CLAWQL_SYNC_PROVIDER' "${TMP_GCS}"
grep -q 'value: gcs' "${TMP_GCS}"
grep -q 'name: CLAWQL_SYNC_ENDPOINT' "${TMP_GCS}"
grep -q 'value: https://storage.googleapis.com' "${TMP_GCS}"
grep -q 'value: acme-gcs-clawql' "${TMP_GCS}"

echo "OK: teamSync Helm template assertions passed (r2 + gcs)"
