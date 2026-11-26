#!/usr/bin/env bash
# Fail if ci/values-regulated-kind.yaml sets keys outside the D2 allowlist.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OVERLAY="${ROOT}/manifests/charts/clawql-mcp/ci/values-regulated-kind.yaml"

python3 - "$OVERLAY" <<'PY'
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    # Fallback: minimal allowlist check via line prefixes when PyYAML missing.
    text = Path(sys.argv[1]).read_text()
    allowed_roots = {"security", "kyverno", "image", "extraEnv", "envFromSecret"}
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if line and not line[0].isspace() and ":" in line:
            key = line.split(":", 1)[0].strip()
            if key not in allowed_roots:
                print(f"FAIL: overlay top-level key not allowed: {key}", file=sys.stderr)
                sys.exit(1)
    print("OK: overlay top-level keys within allowlist (no PyYAML)")
    sys.exit(0)

path = Path(sys.argv[1])
doc = yaml.safe_load(path.read_text()) or {}

allowed = {
    ("security", "kata", "enabled"),
    ("kyverno", "imageSignaturePolicy", "enabled"),
    ("image", "repository"),
    ("image", "tag"),
    ("image", "pullPolicy"),
    ("extraEnv",),  # list; validated separately
    ("envFromSecret",),
}

def walk(obj, prefix=()):
    if prefix == ("extraEnv",):
        if not isinstance(obj, list):
            raise SystemExit("extraEnv must be a list")
        allowed_env = {
            "CLAWQL_AUTH_OIDC_JWKS_URL",
            "CLAWQL_AUTH_OIDC_ISSUER",
            "CLAWQL_AUTH_OIDC_AUDIENCE",
            "CLAWQL_WORM_S3_ENDPOINT",
            "CLAWQL_WORM_S3_BUCKET",
            "CLAWQL_WORM_S3_FORCE_PATH_STYLE",
            "CLAWQL_WORM_S3_REGION",
        }
        for item in obj:
            name = item.get("name")
            if name not in allowed_env:
                raise SystemExit(f"extraEnv name not allowed: {name}")
            if set(item.keys()) - {"name", "value"}:
                raise SystemExit(f"extraEnv item has unexpected keys: {item}")
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            walk(v, prefix + (k,))
        return
    if prefix not in allowed and not any(prefix[: len(a)] == a for a in allowed if len(a) < len(prefix)):
        # leaf must match an allowed path exactly, or be under a list allow
        if prefix not in allowed:
            raise SystemExit(f"overlay key path not allowed: {'.'.join(prefix)}")

# Validate structure: only allowed top-level keys
allowed_top = {"security", "kyverno", "image", "extraEnv", "envFromSecret"}
extra = set(doc) - allowed_top
if extra:
    raise SystemExit(f"overlay top-level keys not allowed: {sorted(extra)}")

# Nested allowlist
if "security" in doc:
    sec = doc["security"]
    if set(sec) - {"kata"}:
        raise SystemExit(f"security keys not allowed: {sorted(set(sec)-{'kata'})}")
    if set(sec.get("kata", {})) - {"enabled"}:
        raise SystemExit("security.kata may only set enabled")
if "kyverno" in doc:
    k = doc["kyverno"]
    if set(k) - {"imageSignaturePolicy"}:
        raise SystemExit(f"kyverno keys not allowed: {sorted(set(k)-{'imageSignaturePolicy'})}")
    isp = k.get("imageSignaturePolicy", {})
    if set(isp) - {"enabled"}:
        raise SystemExit("kyverno.imageSignaturePolicy may only set enabled")
if "image" in doc:
    if set(doc["image"]) - {"repository", "tag", "pullPolicy"}:
        raise SystemExit(f"image keys not allowed: {sorted(set(doc['image'])-{'repository','tag','pullPolicy'})}")
if "extraEnv" in doc:
    walk(doc["extraEnv"], ("extraEnv",))
if "envFromSecret" in doc and not isinstance(doc["envFromSecret"], str):
    raise SystemExit("envFromSecret must be a string")

print("OK: regulated-kind overlay keys within D2 allowlist")
PY
