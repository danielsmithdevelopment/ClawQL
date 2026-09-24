#!/usr/bin/env bash
# Fetch celld S3 leases (fail-closed) then evaluate via BurstWatchSources.
#
# Does NOT invent leases or watch events. Requires real AWS credentials that
# pass the same R2-sync refusal as fetch-celld-leases-from-s3.sh.
#
# Usage:
#   CLAWQL_CELLD_LEASE_BUCKET=my-celld-fleet \
#     bash scripts/run-burst-watch-from-s3-leases.sh [leases.json]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-${ROOT}/artifacts/celld-leases.json}"
FETCH="${ROOT}/infra/aws-celld-burst/fetch-celld-leases-from-s3.sh"
EVAL="${ROOT}/scripts/burst-watch-from-celld-leases.mts"

die() { echo "run-burst-watch-from-s3-leases: $*" >&2; exit 2; }

[[ -x "${FETCH}" || -f "${FETCH}" ]] || die "missing ${FETCH}"
mkdir -p "$(dirname "${OUT}")"

echo "Fetching leases → ${OUT}"
bash "${FETCH}" "${OUT}"

echo "Evaluating via BurstWatchSources…"
cd "${ROOT}"
npx tsx "${EVAL}" "${OUT}"
