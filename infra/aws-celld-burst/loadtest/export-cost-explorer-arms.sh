#!/usr/bin/env bash
# §13.5 Cost Explorer three-arm CSV export (fail-closed).
#
# Does NOT invent $Y. Requires:
#   - aws CLI
#   - real AWS credentials that pass `sts get-caller-identity`
#   - env CLAWQL_S13_TAG_KEY (default: clawql:section13-arm)
#   - env CLAWQL_S13_START / CLAWQL_S13_END (YYYY-MM-DD, Cost Explorer exclusive end)
#   - optional arm tag values: CLAWQL_S13_ARM_A / _B / _C (defaults: A, B, C)
#   - optional CLAWQL_CE_ACCESS_KEY_ID + CLAWQL_CE_SECRET_ACCESS_KEY (+ optional
#     CLAWQL_CE_SESSION_TOKEN / CLAWQL_CE_REGION) to override AWS_* when the
#     sandbox keeps R2 sync keys in AWS_* (mixed Cursor/Cloud Agent envs)
#
# Refuses Cloudflare R2-style keys (effective AWS_ACCESS_KEY_ID equals
# CLAWQL_SYNC_ACCESS_KEY_ID) by requiring a successful STS call against default
# AWS endpoints.
#
# Usage:
#   CLAWQL_S13_START=2026-09-20 CLAWQL_S13_END=2026-09-21 \
#     bash infra/aws-celld-burst/loadtest/export-cost-explorer-arms.sh ./ce-out
#   # Mixed sandbox (AWS_* == R2 sync):
#   CLAWQL_CE_ACCESS_KEY_ID=… CLAWQL_CE_SECRET_ACCESS_KEY=… \
#     CLAWQL_S13_START=… CLAWQL_S13_END=… \
#     bash infra/aws-celld-burst/loadtest/export-cost-explorer-arms.sh ./ce-out
set -euo pipefail

OUT_DIR="${1:-./ce-exports}"
TAG_KEY="${CLAWQL_S13_TAG_KEY:-clawql:section13-arm}"
ARM_A="${CLAWQL_S13_ARM_A:-A}"
ARM_B="${CLAWQL_S13_ARM_B:-B}"
ARM_C="${CLAWQL_S13_ARM_C:-C}"
START="${CLAWQL_S13_START:-}"
END="${CLAWQL_S13_END:-}"

die() { echo "export-cost-explorer-arms: $*" >&2; exit 2; }

# Prefer explicit CE credentials so AWS_* can remain R2 sync in mixed sandboxes.
if [[ -n "${CLAWQL_CE_ACCESS_KEY_ID:-}" ]]; then
  if [[ -z "${CLAWQL_CE_SECRET_ACCESS_KEY:-}" ]]; then
    die "CLAWQL_CE_ACCESS_KEY_ID set but CLAWQL_CE_SECRET_ACCESS_KEY missing"
  fi
  export AWS_ACCESS_KEY_ID="${CLAWQL_CE_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${CLAWQL_CE_SECRET_ACCESS_KEY}"
  if [[ -n "${CLAWQL_CE_SESSION_TOKEN:-}" ]]; then
    export AWS_SESSION_TOKEN="${CLAWQL_CE_SESSION_TOKEN}"
  else
    unset AWS_SESSION_TOKEN || true
  fi
  if [[ -n "${CLAWQL_CE_REGION:-}" ]]; then
    export AWS_DEFAULT_REGION="${CLAWQL_CE_REGION}"
    export AWS_REGION="${CLAWQL_CE_REGION}"
  fi
  echo "Using CLAWQL_CE_* credentials for Cost Explorer (overrode AWS_*)"
fi

# Fail-closed ordering: refuse R2-sync key collision before requiring aws CLI
# so CI / local sandboxes without aws still prove the honesty gate.
if [[ -n "${CLAWQL_SYNC_ACCESS_KEY_ID:-}" && -n "${AWS_ACCESS_KEY_ID:-}" && \
      "${AWS_ACCESS_KEY_ID}" == "${CLAWQL_SYNC_ACCESS_KEY_ID}" ]]; then
  die "AWS_ACCESS_KEY_ID matches CLAWQL_SYNC_ACCESS_KEY_ID (R2 sync) — refusing; use real AWS EKS/CE credentials (or set CLAWQL_CE_*)"
fi
if [[ -z "${START}" || -z "${END}" ]]; then
  die "set CLAWQL_S13_START and CLAWQL_S13_END (YYYY-MM-DD; END exclusive)"
fi
if ! command -v aws >/dev/null 2>&1; then
  die "aws CLI not found — install AWS CLI v2 before exporting Cost Explorer"
fi

echo "Verifying AWS caller identity…"
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  die "aws sts get-caller-identity failed — not real AWS credentials / no network"
fi
aws sts get-caller-identity

mkdir -p "${OUT_DIR}"

export_arm() {
  local arm_name="$1"
  local tag_value="$2"
  local out_csv="${OUT_DIR}/ce-arm-${arm_name}.csv"
  echo "Exporting arm ${arm_name} tag ${TAG_KEY}=${tag_value} → ${out_csv}"
  # GROUP BY TAG; UnblendedCost for fill-result-from-exports.mjs
  local tmp
  tmp="$(mktemp)"
  if ! aws ce get-cost-and-usage \
    --time-period "Start=${START},End=${END}" \
    --granularity DAILY \
    --metrics UnblendedCost \
    --filter "Tags={Key=${TAG_KEY},Values=[${tag_value}]}" \
    --group-by "Type=TAG,Key=${TAG_KEY}" \
    --output json >"${tmp}"; then
    rm -f "${tmp}"
    die "Cost Explorer GetCostAndUsage failed for arm ${arm_name}"
  fi
  # Convert ResultsByTime[].Groups[].Metrics.UnblendedCost.Amount → CSV
  node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(process.argv[1], "utf8"));
const rows = ["UnblendedCost"];
let any = false;
for (const day of raw.ResultsByTime || []) {
  for (const g of day.Groups || []) {
    const amt = g?.Metrics?.UnblendedCost?.Amount;
    if (amt == null || amt === "") continue;
    const n = Number(amt);
    if (!Number.isFinite(n)) throw new Error(`non-numeric UnblendedCost ${amt}`);
    rows.push(String(n));
    any = true;
  }
  // Untagged / empty groups: still record Total if present and no groups
  if ((!day.Groups || day.Groups.length === 0) && day.Total?.UnblendedCost?.Amount != null) {
    const n = Number(day.Total.UnblendedCost.Amount);
    if (Number.isFinite(n) && n !== 0) {
      rows.push(String(n));
      any = true;
    }
  }
}
if (!any) {
  console.error("No UnblendedCost rows for this arm/tag/window — refusing empty inventable CSV");
  process.exit(3);
}
writeFileSync(process.argv[2], rows.join("\n") + "\n");
console.log("wrote", process.argv[2], "rows", rows.length - 1);
' "${tmp}" "${out_csv}"
  rm -f "${tmp}"
}

export_arm a "${ARM_A}"
export_arm b "${ARM_B}"
export_arm c "${ARM_C}"

echo "OK: three arm CSVs under ${OUT_DIR}"
ls -la "${OUT_DIR}"/ce-arm-*.csv
echo "Next: pair with k6 metrics JSON and run fill-result-from-exports.mjs"
