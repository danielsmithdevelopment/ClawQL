#!/usr/bin/env bash
# Smoke: pack + install clawql-merkle then clawql-audit as a standalone consumer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

echo "Building clawql-merkle + clawql-audit…"
npm run build -w clawql-merkle -w clawql-audit >/dev/null

INSTALL_ROOT="$(mktemp -d)"
PACK_DIR="$(mktemp -d)"
trap 'rm -rf "${INSTALL_ROOT}" "${PACK_DIR}"' EXIT

npm pack -w clawql-merkle --pack-destination "${PACK_DIR}" >/dev/null
npm pack -w clawql-audit --pack-destination "${PACK_DIR}" >/dev/null

MERKLE_TGZ="$(find "${PACK_DIR}" -maxdepth 1 -name 'clawql-merkle-*.tgz' -print -quit)"
AUDIT_TGZ="$(find "${PACK_DIR}" -maxdepth 1 -name 'clawql-audit-*.tgz' -print -quit)"
if [[ -z "${MERKLE_TGZ}" || -z "${AUDIT_TGZ}" ]]; then
  echo "ERROR: missing packed tarballs" >&2
  ls -la "${PACK_DIR}" >&2 || true
  exit 1
fi

npm run check:standalone -w clawql-audit

cd "${INSTALL_ROOT}"
npm init -y >/dev/null 2>&1
echo "Installing clawql-merkle from $(basename "${MERKLE_TGZ}")…"
npm install "${MERKLE_TGZ}" --no-fund --no-audit >/dev/null
echo "Installing clawql-audit from $(basename "${AUDIT_TGZ}")…"
npm install "${AUDIT_TGZ}" --no-fund --no-audit >/dev/null

node --input-type=module <<'NODE'
import { buildMerkleSnapshot, verifyMerkleProof, merkleProof } from "clawql-merkle";
import {
  createMemoryBackend,
  createSimulatedTeeSigner,
  createWORMAuditTrail,
  verifyTEESignature,
} from "clawql-audit";
import { Effect } from "effect";

const snap = buildMerkleSnapshot([
  { path: "a.md", bodySha256Hex: "a".repeat(64) },
  { path: "b.md", bodySha256Hex: "b".repeat(64) },
]);
const proof = merkleProof(snap, 0);
if (!verifyMerkleProof(snap.leaves[0], 0, snap.leafCount, proof, snap.rootHex)) {
  throw new Error("merkle proof failed");
}

const tee = await Effect.runPromise(createSimulatedTeeSigner());
const worm = await createWORMAuditTrail({
  local: createMemoryBackend(),
  remote: createMemoryBackend(),
  tee,
});
const entry = await Effect.runPromise(
  worm.append({
    type: "SESSION_START",
    timestamp: new Date().toISOString(),
    sessionId: "pack-smoke",
  })
);
const v = await Effect.runPromise(verifyTEESignature(entry, tee.publicKeyPem, tee.attestation));
if (!v.valid) throw new Error(`TEE verify failed: ${v.reason}`);
const chain = await Effect.runPromise(worm.verify());
if (!chain.ok) throw new Error(`chain verify failed: ${JSON.stringify(chain.issues)}`);
console.log("OK: standalone clawql-merkle + clawql-audit pack install");
NODE

echo "OK: test-npm-pack-audit-wedge.sh"
