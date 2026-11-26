#!/usr/bin/env bash
# Fail if a regulated-kind CI overlay sets keys outside the allowlist.
# Also refuse `extraEnv` (Helm list-replace would wipe values-regulated.yaml).
# PyYAML is required (no line-scan fallback — H6).
#
# Usage:
#   check-regulated-kind-overlay.sh           # D2 unsigned PR overlay
#   check-regulated-kind-overlay.sh --signed  # D3 Cosign/GHCR overlay
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="partial"
OVERLAY="${ROOT}/manifests/charts/clawql-mcp/ci/values-regulated-kind.yaml"
if [[ "${1:-}" == "--signed" ]]; then
  MODE="signed"
  OVERLAY="${ROOT}/manifests/charts/clawql-mcp/ci/values-regulated-kind-signed.yaml"
fi

python3 - "$OVERLAY" "$MODE" <<'PY'
import sys
from pathlib import Path

try:
    import yaml
except ImportError as e:
    raise SystemExit(f"PyYAML required for regulated-kind overlay check: {e}") from e

path = Path(sys.argv[1])
mode = sys.argv[2]
doc = yaml.safe_load(path.read_text()) or {}

if "extraEnv" in doc:
    raise SystemExit(
        "overlay must not set extraEnv (Helm replaces lists and would wipe "
        "CLAWQL_TIER/WORM/inference from values-regulated.yaml) — use extraEnvAppend"
    )

allowed_env = {
    "CLAWQL_HOME",
    "CLAWQL_AUTH_OIDC_JWKS_URL",
    "CLAWQL_AUTH_OIDC_ISSUER",
    "CLAWQL_AUTH_OIDC_AUDIENCE",
    "CLAWQL_WORM_S3_ENDPOINT",
    "CLAWQL_WORM_S3_BUCKET",
    "CLAWQL_WORM_S3_FORCE_PATH_STYLE",
    "CLAWQL_WORM_S3_REGION",
}

allowed_top = {
    "security",
    "kyverno",
    "image",
    "extraEnvAppend",
    "envFromSecret",
    "networkPolicy",
    "enableGrpc",
    "clawql-mcp-grpc",
    "grpcTls",
}
extra = set(doc) - allowed_top
if extra:
    raise SystemExit(f"overlay top-level keys not allowed: {sorted(extra)}")

if "security" in doc:
    sec = doc["security"]
    if set(sec) - {"kata"}:
        raise SystemExit(f"security keys not allowed: {sorted(set(sec)-{'kata'})}")
    if set(sec.get("kata", {})) - {"enabled"}:
        raise SystemExit("security.kata may only set enabled")
    if sec.get("kata", {}).get("enabled") is not False:
        raise SystemExit("security.kata.enabled must be false on kind (no Kata runtime)")
if "kyverno" in doc:
    k = doc["kyverno"]
    if set(k) - {"imageSignaturePolicy"}:
        raise SystemExit(f"kyverno keys not allowed: {sorted(set(k)-{'imageSignaturePolicy'})}")
    isp = k.get("imageSignaturePolicy", {})
    allowed_isp = {"enabled"} if mode == "partial" else {"enabled", "matchReleaseNamespaceOnly"}
    if set(isp) - allowed_isp:
        raise SystemExit(
            f"kyverno.imageSignaturePolicy keys not allowed: {sorted(set(isp)-allowed_isp)}"
        )
    want = False if mode == "partial" else True
    if isp.get("enabled") is not want:
        raise SystemExit(
            f"kyverno.imageSignaturePolicy.enabled must be {want} for {mode} overlay"
        )
if "image" in doc:
    if set(doc["image"]) - {"repository", "tag", "pullPolicy"}:
        raise SystemExit(
            f"image keys not allowed: {sorted(set(doc['image'])-{'repository','tag','pullPolicy'})}"
        )
    repo = (doc["image"].get("repository") or "")
    if mode == "signed":
        if not str(repo).startswith("ghcr.io/danielsmithdevelopment/clawql-mcp"):
            raise SystemExit(
                f"signed overlay image.repository must be GHCR clawql-mcp, got {repo!r}"
            )
    else:
        if "ghcr.io" in str(repo):
            raise SystemExit(
                "partial overlay must use a local image repository (not GHCR) — D3 covers signed"
            )
if "enableGrpc" in doc and doc["enableGrpc"] is not True:
    raise SystemExit("enableGrpc must be true on the kind overlay (self-signed TLS Secret)")
if "clawql-mcp-grpc" in doc:
    g = doc["clawql-mcp-grpc"]
    if set(g) - {"enabled"}:
        raise SystemExit(f"clawql-mcp-grpc keys not allowed: {sorted(set(g)-{'enabled'})}")
    if g.get("enabled") is not True:
        raise SystemExit("clawql-mcp-grpc.enabled must be true on the kind overlay")
if "grpcTls" in doc:
    gt = doc["grpcTls"]
    if set(gt) - {"existingSecret", "mountPath", "certFile", "keyFile"}:
        raise SystemExit(
            f"grpcTls keys not allowed: {sorted(set(gt)-{'existingSecret','mountPath','certFile','keyFile'})}"
        )
    if not isinstance(gt.get("existingSecret"), str) or not gt.get("existingSecret"):
        raise SystemExit("grpcTls.existingSecret must be a non-empty string")
if "networkPolicy" in doc:
    np = doc["networkPolicy"]
    if set(np) - {"defaultDeny"}:
        raise SystemExit(f"networkPolicy keys not allowed: {sorted(set(np)-{'defaultDeny'})}")
    dd = np.get("defaultDeny") or {}
    if set(dd) - {"extraEgress"}:
        raise SystemExit(
            "networkPolicy.defaultDeny may only set extraEgress "
            f"(got {sorted(set(dd)-{'extraEgress'})})"
        )
    if "extraEgress" in dd and not isinstance(dd["extraEgress"], list):
        raise SystemExit("networkPolicy.defaultDeny.extraEgress must be a list")
if "extraEnvAppend" in doc:
    obj = doc["extraEnvAppend"]
    if not isinstance(obj, list):
        raise SystemExit("extraEnvAppend must be a list")
    for item in obj:
        name = item.get("name")
        if name not in allowed_env:
            raise SystemExit(f"extraEnvAppend name not allowed: {name}")
        if set(item.keys()) - {"name", "value"}:
            raise SystemExit(f"extraEnvAppend item has unexpected keys: {item}")
if "envFromSecret" in doc and not isinstance(doc["envFromSecret"], str):
    raise SystemExit("envFromSecret must be a string")

print(f"OK: regulated-kind {mode} overlay keys within allowlist")
PY
