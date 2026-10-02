#!/usr/bin/env bash
# Fetch celld S3 fleet lease snapshots for CelldFleetHealthService (fail-closed).
#
# Does NOT invent lease records. Requires:
#   - aws CLI
#   - real AWS credentials that pass sts get-caller-identity
#   - CLAWQL_CELLD_LEASE_BUCKET (required)
#   - optional CLAWQL_CELLD_LEASE_PREFIX (default: leases/)
#   - optional CLAWQL_CELLD_AWS_ACCESS_KEY_ID + CLAWQL_CELLD_AWS_SECRET_ACCESS_KEY
#     (+ optional CLAWQL_CELLD_AWS_SESSION_TOKEN / CLAWQL_CELLD_AWS_REGION) to
#     override AWS_* when the sandbox keeps R2 sync keys in AWS_*
#
# Refuses Cloudflare R2-style sync keys when effective AWS_ACCESS_KEY_ID equals
# CLAWQL_SYNC_ACCESS_KEY_ID (same honesty gate as §13.5 CE export).
#
# Writes JSON array of { nodeId, renewedAtMs, ttlMs?, peerIds? } to OUT_FILE.
#
# Usage:
#   CLAWQL_CELLD_LEASE_BUCKET=my-celld-fleet \
#     bash infra/aws-celld-burst/fetch-celld-leases-from-s3.sh ./leases.json
set -euo pipefail

OUT_FILE="${1:-./celld-leases.json}"
BUCKET="${CLAWQL_CELLD_LEASE_BUCKET:-}"
PREFIX="${CLAWQL_CELLD_LEASE_PREFIX:-leases/}"

die() { echo "fetch-celld-leases-from-s3: $*" >&2; exit 2; }

# Prefer explicit celld AWS credentials so AWS_* can remain R2 sync.
if [[ -n "${CLAWQL_CELLD_AWS_ACCESS_KEY_ID:-}" ]]; then
  if [[ -z "${CLAWQL_CELLD_AWS_SECRET_ACCESS_KEY:-}" ]]; then
    die "CLAWQL_CELLD_AWS_ACCESS_KEY_ID set but CLAWQL_CELLD_AWS_SECRET_ACCESS_KEY missing"
  fi
  export AWS_ACCESS_KEY_ID="${CLAWQL_CELLD_AWS_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${CLAWQL_CELLD_AWS_SECRET_ACCESS_KEY}"
  if [[ -n "${CLAWQL_CELLD_AWS_SESSION_TOKEN:-}" ]]; then
    export AWS_SESSION_TOKEN="${CLAWQL_CELLD_AWS_SESSION_TOKEN}"
  else
    unset AWS_SESSION_TOKEN || true
  fi
  if [[ -n "${CLAWQL_CELLD_AWS_REGION:-}" ]]; then
    export AWS_DEFAULT_REGION="${CLAWQL_CELLD_AWS_REGION}"
    export AWS_REGION="${CLAWQL_CELLD_AWS_REGION}"
  fi
  echo "Using CLAWQL_CELLD_AWS_* credentials for lease fetch (overrode AWS_*)"
fi

# Fail-closed ordering: R2 collision before aws CLI requirement
if [[ -n "${CLAWQL_SYNC_ACCESS_KEY_ID:-}" && -n "${AWS_ACCESS_KEY_ID:-}" && \
      "${AWS_ACCESS_KEY_ID}" == "${CLAWQL_SYNC_ACCESS_KEY_ID}" ]]; then
  die "AWS_ACCESS_KEY_ID matches CLAWQL_SYNC_ACCESS_KEY_ID (R2 sync) — refusing; use real AWS celld fleet credentials (or set CLAWQL_CELLD_AWS_*)"
fi
if [[ -z "${BUCKET}" ]]; then
  die "set CLAWQL_CELLD_LEASE_BUCKET"
fi
if ! command -v aws >/dev/null 2>&1; then
  die "aws CLI not found — install AWS CLI v2 before fetching leases"
fi

echo "Verifying AWS caller identity…"
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  die "aws sts get-caller-identity failed — not real AWS credentials / no network"
fi
aws sts get-caller-identity

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

echo "Listing s3://${BUCKET}/${PREFIX} …"
# List object keys under prefix
mapfile -t KEYS < <(aws s3api list-objects-v2 \
  --bucket "${BUCKET}" \
  --prefix "${PREFIX}" \
  --query 'Contents[].Key' \
  --output text 2>/dev/null | tr '\t' '\n' | sed '/^None$/d' | sed '/^$/d' || true)

if [[ ${#KEYS[@]} -eq 0 ]]; then
  die "no lease objects under s3://${BUCKET}/${PREFIX} — refusing empty inventable snapshot"
fi

LEASE_FILES=()
for key in "${KEYS[@]}"; do
  # Skip "directories"
  [[ "${key}" == */ ]] && continue
  base="$(basename "${key}")"
  dest="${TMP}/${base}"
  if ! aws s3api get-object --bucket "${BUCKET}" --key "${key}" "${dest}" >/dev/null; then
    die "failed to get s3://${BUCKET}/${key}"
  fi
  LEASE_FILES+=("${dest}")
done

if [[ ${#LEASE_FILES[@]} -eq 0 ]]; then
  die "prefix listed keys but no downloadable lease objects"
fi

node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const outPath = process.argv[1];
const files = process.argv.slice(2);
const leases = [];
for (const f of files) {
  const raw = JSON.parse(readFileSync(f, "utf8"));
  const rows = Array.isArray(raw) ? raw : [raw];
  for (const row of rows) {
    const nodeId = row.nodeId ?? row.node_id ?? row.id ?? row.name;
    const renewed =
      row.renewedAtMs ?? row.renewed_at_ms ?? row.renewedAt ?? row.updatedAtMs ?? row.mtimeMs;
    if (nodeId == null || nodeId === "") throw new Error(`lease missing nodeId in ${f}`);
    if (renewed == null || !Number.isFinite(Number(renewed))) {
      throw new Error(`lease ${nodeId} missing numeric renewedAtMs`);
    }
    const ttl = row.ttlMs ?? row.ttl_ms ?? row.ttl;
    const peers = row.peerIds ?? row.peer_ids ?? row.peers;
    leases.push({
      nodeId: String(nodeId),
      renewedAtMs: Number(renewed),
      ...(ttl != null && Number.isFinite(Number(ttl)) ? { ttlMs: Number(ttl) } : {}),
      ...(Array.isArray(peers) ? { peerIds: peers.map(String) } : {}),
    });
  }
}
if (leases.length === 0) {
  console.error("no parseable leases — refusing empty inventable snapshot");
  process.exit(3);
}
writeFileSync(outPath, JSON.stringify(leases, null, 2) + "\n");
console.log("wrote", outPath, "leases", leases.length);
' "${OUT_FILE}" "${LEASE_FILES[@]}"

echo "OK: ${OUT_FILE}"
echo "Next: feed into CelldFleetHealthService / evaluateCelldFleetHealth (parseCelldLeaseSnapshotJson)"
