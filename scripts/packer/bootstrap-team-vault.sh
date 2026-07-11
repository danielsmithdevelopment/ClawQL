#!/usr/bin/env bash
# Boot-time: pull team vault from object storage, verify manifest SHA-256s, doctor smoke gate.
# Credentials must be in env (R2/S3/GCS keys) — never baked into the image.
set -euo pipefail

CLAWQL_HOME="${CLAWQL_HOME:-${HOME}/.ClawQL}"
export CLAWQL_HOME

if [ -z "${CLAWQL_SYNC_BUCKET:-}" ] || [ "${CLAWQL_SYNC_BUCKET}" = "CONFIGURE_AT_BOOT" ]; then
  echo "[bootstrap-team-vault] CLAWQL_SYNC_BUCKET is required at boot" >&2
  exit 1
fi

if [ -f "${CLAWQL_HOME}/sync.json" ]; then
  # Merge runtime bucket/prefix over bake template when env overrides are set.
  if command -v python3 >/dev/null 2>&1; then
    python3 - "${CLAWQL_HOME}/sync.json" <<'PY'
import json
import os
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
if os.environ.get("CLAWQL_SYNC_BUCKET"):
    data["bucket"] = os.environ["CLAWQL_SYNC_BUCKET"]
if os.environ.get("CLAWQL_SYNC_PREFIX"):
    data["prefix"] = os.environ["CLAWQL_SYNC_PREFIX"]
if os.environ.get("CLAWQL_SYNC_PROVIDER"):
    data["provider"] = os.environ["CLAWQL_SYNC_PROVIDER"]
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
  fi
fi

echo "[bootstrap-team-vault] Pulling team vault from ${CLAWQL_SYNC_PROVIDER:-r2}://${CLAWQL_SYNC_BUCKET}/${CLAWQL_SYNC_PREFIX:-}"

if ! command -v clawql >/dev/null 2>&1; then
  echo "[bootstrap-team-vault] clawql CLI missing" >&2
  exit 1
fi

clawql sync pull
clawql doctor --smoke

echo "[bootstrap-team-vault] Team vault seeded and verified"
