#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT

_LINT_SECRET=(--set envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-mcp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set kyverno.imageSignaturePolicy.enabled=false \
  --set secretSourcing.externalSecrets.enabled=true >"${TMP}"

python3 - "${TMP}" <<'PY'
import re
import sys

text = open(sys.argv[1], encoding="utf-8").read()

checks = [
    (r"kind: ClusterSecretStore", "ClusterSecretStore"),
    (r"kind: ExternalSecret", "ExternalSecret"),
    (r"property: paperlessApiToken", "paperless mapping"),
    (r"secretKey: PAPERLESS_API_TOKEN", "paperless env key"),
    (r"property: nextcloudUsername", "nextcloud username mapping"),
    (r"property: coneshareApiToken", "coneshare mapping"),
    (r'key: clawql/providers', "vault KV path"),
    (r"hashicorpvault\.clawql\.svc\.cluster\.local:8200", "in-cluster Vault URL"),
]

for pattern, message in checks:
    if re.search(pattern, text) is None:
        print(f"ERROR: missing {message}")
        sys.exit(1)

if text.count("property:") < 10:
    print("ERROR: expected at least 10 provider property mappings")
    sys.exit(1)

PY

echo "helm-vault-secrets-template-tests OK"
