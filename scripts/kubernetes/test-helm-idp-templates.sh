#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

helm dependency update charts/clawql-idp >/dev/null

TMP_LEAN="$(mktemp)"
TMP_FULL="$(mktemp)"
trap 'rm -f "${TMP_LEAN}" "${TMP_FULL}"' EXIT

_LINT_SECRET=(--set clawql-mcp.envFromSecret=clawql-lint-provider-env)

helm template test charts/clawql-idp --namespace clawql \
  "${_LINT_SECRET[@]}" \
  --set clawql-mcp.kyverno.imageSignaturePolicy.enabled=false \
  >"${TMP_LEAN}"

helm template test charts/clawql-idp --namespace clawql \
  -f charts/clawql-idp/values-idp-full.yaml \
  "${_LINT_SECRET[@]}" \
  --set clawql-mcp.kyverno.imageSignaturePolicy.enabled=false \
  --set-string clawql-mcp.openclaw.gatewayToken=helm-idp-test-token \
  >"${TMP_FULL}"

python3 - "${TMP_LEAN}" "${TMP_FULL}" <<'PY'
import json
import re
import sys

lean_path, full_path = sys.argv[1], sys.argv[2]
lean = open(lean_path, "r", encoding="utf-8").read()
full = open(full_path, "r", encoding="utf-8").read()


def instance_specs(manifest: str) -> list[dict]:
    specs = []
    for m in re.finditer(
        r'name: CLAWQL_INSTANCE_SPEC\n\s+value: ("(?:\\.|[^"\\])*")\n',
        manifest,
    ):
        specs.append(json.loads(json.loads(m.group(1))))
    return specs


# Lean profile: MCP deployment renders, workflow off
if "kind: Deployment" not in lean:
    print("ERROR: lean profile missing Deployment")
    sys.exit(1)

lean_specs = instance_specs(lean)
if not lean_specs:
    print("ERROR: lean profile missing CLAWQL_INSTANCE_SPEC")
    sys.exit(1)
if any(s.get("automation", {}).get("workflow", {}).get("enabled") is True for s in lean_specs):
    print("ERROR: lean profile should not enable workflow")
    sys.exit(1)

full_specs = instance_specs(full)
if not full_specs:
    print("ERROR: full profile missing CLAWQL_INSTANCE_SPEC")
    sys.exit(1)

def any_enabled(path_keys: tuple[str, ...]) -> bool:
    for spec in full_specs:
        cur: object = spec
        for key in path_keys:
            if not isinstance(cur, dict) or key not in cur:
                cur = None
                break
            cur = cur[key]
        if cur is True:
            return True
    return False

if not any_enabled(("automation", "workflow", "enabled")):
    print("ERROR: full profile missing automation.workflow.enabled")
    sys.exit(1)
if not any_enabled(("automation", "argocd", "enabled")):
    print("ERROR: full profile missing automation.argocd.enabled")
    sys.exit(1)
if not any_enabled(("automation", "notify", "enabled")):
    print("ERROR: full profile missing automation.notify.enabled")
    sys.exit(1)

# Full profile still ships document pipeline + openclaw resources
for pattern, message in [
    (r"document-pipeline", "document pipeline stack"),
    (r"openclaw", "openclaw resources"),
]:
    if re.search(pattern, full, flags=re.MULTILINE | re.IGNORECASE) is None:
        print(f"ERROR: full profile missing {message}")
        sys.exit(1)

print("helm-idp-template-tests OK")
PY
