#!/usr/bin/env bash
# Assert teamSync Helm values render expected CLAWQL_SYNC_* env on MCP Deployment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP_R2="$(mktemp)"
TMP_GCS="$(mktemp)"
trap 'rm -f "${TMP_R2}" "${TMP_GCS}"' EXIT

_LINT_SECRET=(--set envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set teamSync.enabled=true \
  --set teamSync.bucket=acme-team-clawql \
  --set teamSync.prefix=teams/demo/ \
  --set teamSync.autoPush=true \
  --set teamSync.autoPull=true \
  --set teamSync.r2.accountId=abc123 \
  >"${TMP_R2}"

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set teamSync.enabled=true \
  --set teamSync.provider=gcs \
  --set teamSync.bucket=acme-gcs-clawql \
  --set teamSync.prefix=teams/gcp/ \
  >"${TMP_GCS}"

python3 - "${TMP_R2}" "${TMP_GCS}" <<'PY'
import re
import sys

r2_path, gcs_path = sys.argv[1], sys.argv[2]
r2 = open(r2_path, encoding="utf-8").read()
gcs = open(gcs_path, encoding="utf-8").read()

r2_checks = [
    (r"name: CLAWQL_SYNC_BUCKET", "CLAWQL_SYNC_BUCKET"),
    (r'value: "acme-team-clawql"', "team bucket"),
    (r"name: CLAWQL_SYNC_AUTO\b", "CLAWQL_SYNC_AUTO"),
    (r"name: CLAWQL_SYNC_AUTO_PULL", "CLAWQL_SYNC_AUTO_PULL"),
    (r"name: CLAWQL_R2_ACCOUNT_ID", "CLAWQL_R2_ACCOUNT_ID"),
    (r'value: "abc123"', "R2 account id"),
]

gcs_checks = [
    (r"name: CLAWQL_SYNC_PROVIDER", "CLAWQL_SYNC_PROVIDER"),
    (r'value: "gcs"', "GCS provider"),
    (r"name: CLAWQL_SYNC_ENDPOINT", "CLAWQL_SYNC_ENDPOINT"),
    (r'value: "https://storage\.googleapis\.com"', "GCS endpoint"),
    (r'value: "acme-gcs-clawql"', "GCS bucket"),
]

for pattern, message in r2_checks:
    if re.search(pattern, r2) is None:
        print(f"ERROR (r2): missing {message}")
        sys.exit(1)

for pattern, message in gcs_checks:
    if re.search(pattern, gcs) is None:
        print(f"ERROR (gcs): missing {message}")
        sys.exit(1)
PY

echo "helm-team-sync-template-tests OK"
