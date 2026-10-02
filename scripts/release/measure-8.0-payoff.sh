#!/usr/bin/env bash
# Measure 8.0.0 purge payoff: image size, Syft package count, Trivy CVE counts.
# Builds clawql-mcp runtime images at BEFORE_SHA and AFTER_SHA, then scans both.
#
# Usage:
#   bash scripts/release/measure-8.0-payoff.sh
#   BEFORE_SHA=578e7e77 AFTER_SHA=d6b432e1 OUT_DIR=./payoff-out bash scripts/release/measure-8.0-payoff.sh
#
# Requires: docker, git. Pulls anchore/syft:v1.19.0 and ghcr.io/aquasecurity/trivy:0.59.1
# (same pins as CI / Docker publish).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BEFORE_SHA="${BEFORE_SHA:-578e7e77fab252e8cae245623f836d1f4488c7c2}"
AFTER_SHA="${AFTER_SHA:-d6b432e1}"
# Large docker-save tarballs go under WORKDIR; summary JSON is copied to SUMMARY_DIR.
OUT_DIR="${OUT_DIR:-/tmp/clawql-payoff-scan}"
SUMMARY_DIR="${SUMMARY_DIR:-${ROOT}/docs/releases/payoff-artifacts}"
SYFT_IMAGE="${SYFT_IMAGE:-anchore/syft:v1.19.0}"
TRIVY_IMAGE="${TRIVY_IMAGE:-ghcr.io/aquasecurity/trivy:0.59.1}"
WORKDIR="${WORKDIR:-/tmp/clawql-payoff-measure}"

mkdir -p "$OUT_DIR" "$WORKDIR" "$SUMMARY_DIR"

need() { command -v "$1" >/dev/null || { echo "missing: $1" >&2; exit 1; }; }
need docker
need git
need python3

docker pull "$SYFT_IMAGE" >/dev/null
docker pull "$TRIVY_IMAGE" >/dev/null

build_at() {
  local sha="$1" tag="$2" dir="$3"
  rm -rf "$dir"
  git -C "$ROOT" worktree remove --force "$dir" 2>/dev/null || true
  git -C "$ROOT" worktree add --detach "$dir" "$sha"
  docker build -f "$dir/docker/Dockerfile" --target runtime -t "$tag" "$dir"
}

scan_image() {
  local tag="$1" label="$2"
  local sbom="${OUT_DIR}/sbom-${label}.cdx.json"
  local trivy_json="${OUT_DIR}/trivy-${label}.json"
  local size_file="${OUT_DIR}/size-${label}.txt"

  docker image inspect "$tag" --format '{{.Size}}' >"$size_file"
  docker save "$tag" | gzip -c >"${OUT_DIR}/image-${label}.tar.gz"
  # compressed size of the save (approximate publishable artifact)
  stat -c '%s' "${OUT_DIR}/image-${label}.tar.gz" >"${OUT_DIR}/compressed-${label}.txt"

  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${OUT_DIR}:/out" \
    "$SYFT_IMAGE" scan "$tag" -o "cyclonedx-json=/out/sbom-${label}.cdx.json"

  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${OUT_DIR}:/out" \
    "$TRIVY_IMAGE" image --scanners vuln --severity CRITICAL,HIGH,MEDIUM \
    --format json --output "/out/trivy-${label}.json" "$tag"
}

summarize() {
  python3 - "$OUT_DIR" "$BEFORE_SHA" "$AFTER_SHA" <<'PY'
import json, pathlib, sys
out = pathlib.Path(sys.argv[1])
before_sha, after_sha = sys.argv[2], sys.argv[3]

def pkg_count(sbom_path):
    data = json.loads(sbom_path.read_text())
    comps = data.get("components") or []
    # CycloneDX: count library + os packages (exclude files/metadata noise when type present)
    n = 0
    for c in comps:
        t = (c.get("type") or "").lower()
        if t in ("", "library", "operating-system", "application", "framework", "container"):
            n += 1
    return n, len(comps)

def cve_counts(trivy_path):
    data = json.loads(trivy_path.read_text())
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0}
    for r in data.get("Results") or []:
        for v in r.get("Vulnerabilities") or []:
            sev = (v.get("Severity") or "").upper()
            if sev in counts:
                counts[sev] += 1
    return counts

def row(label, sha):
    size_b = int((out / f"size-{label}.txt").read_text().strip())
    compressed_b = int((out / f"compressed-{label}.txt").read_text().strip())
    n_typed, n_all = pkg_count(out / f"sbom-{label}.cdx.json")
    cves = cve_counts(out / f"trivy-{label}.json")
    return {
        "label": label,
        "sha": sha,
        "image_size_bytes": size_b,
        "image_size_mib": round(size_b / (1024 * 1024), 2),
        "compressed_tar_gz_bytes": compressed_b,
        "compressed_tar_gz_mib": round(compressed_b / (1024 * 1024), 2),
        "syft_components_typed": n_typed,
        "syft_components_total": n_all,
        "cves": cves,
        "cves_chm": cves["CRITICAL"] + cves["HIGH"] + cves["MEDIUM"],
    }

pre = row("pre", before_sha)
post = row("post", after_sha)
summary = {
    "scanners": {"syft": "anchore/syft:v1.19.0", "trivy": "ghcr.io/aquasecurity/trivy:0.59.1"},
    "before": pre,
    "after": post,
    "delta": {
        "image_size_bytes": post["image_size_bytes"] - pre["image_size_bytes"],
        "compressed_tar_gz_bytes": post["compressed_tar_gz_bytes"] - pre["compressed_tar_gz_bytes"],
        "syft_components_total": post["syft_components_total"] - pre["syft_components_total"],
        "cves_chm": post["cves_chm"] - pre["cves_chm"],
        "cves": {k: post["cves"][k] - pre["cves"][k] for k in ("CRITICAL", "HIGH", "MEDIUM")},
    },
}
(out / "payoff-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
PY
}

echo "Building BEFORE ${BEFORE_SHA}…"
build_at "$BEFORE_SHA" clawql-mcp:payoff-pre "${WORKDIR}/pre"
echo "Building AFTER ${AFTER_SHA}…"
build_at "$AFTER_SHA" clawql-mcp:payoff-post "${WORKDIR}/post"

echo "Scanning…"
scan_image clawql-mcp:payoff-pre pre
scan_image clawql-mcp:payoff-post post
summarize
cp -f "${OUT_DIR}/payoff-summary.json" "${SUMMARY_DIR}/payoff-summary.json"

echo "Wrote ${OUT_DIR}/payoff-summary.json and ${SUMMARY_DIR}/payoff-summary.json"
git -C "$ROOT" worktree remove --force "${WORKDIR}/pre" 2>/dev/null || true
git -C "$ROOT" worktree remove --force "${WORKDIR}/post" 2>/dev/null || true
