/**
 * Hash chain for append-only logs (WORM event order).
 * Distinct from {@link buildMerkleSnapshot}: this is prev_hash linkage, not a tree.
 */

import { createHash } from "node:crypto";

export const HASH_CHAIN_GENESIS =
  "0000000000000000000000000000000000000000000000000000000000000000";

export type HashChainLink = {
  seq: number;
  prev_hash: string;
  hash: string;
};

export type HashChainVerifyIssue = {
  seq: number;
  reason: string;
};

export type HashChainVerifyResult = {
  ok: boolean;
  records: number;
  head_hash: string;
  /** True when the first record's prev_hash is the genesis sentinel. */
  fromGenesis: boolean;
  issues: HashChainVerifyIssue[];
};

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] === undefined) continue;
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

/** Deterministic JSON: sorted keys, omit undefined. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashCanonicalPayload(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Seal a payload into a chain link. `payload` must not include `hash`.
 * Canonical hash covers `{ ...payload, seq, prev_hash }`.
 */
export function sealHashChainRecord<T extends Record<string, unknown>>(
  payload: T,
  seq: number,
  prevHash: string
): T & HashChainLink {
  const withoutHash = { ...payload, seq, prev_hash: prevHash };
  const hash = hashCanonicalPayload(withoutHash);
  return { ...withoutHash, hash };
}

export function isHashChained(
  record: Partial<HashChainLink> | null | undefined
): record is HashChainLink {
  return Boolean(
    record &&
    typeof record.seq === "number" &&
    typeof record.prev_hash === "string" &&
    typeof record.hash === "string" &&
    record.prev_hash.length > 0 &&
    record.hash.length > 0
  );
}

function recomputeHash(record: HashChainLink & Record<string, unknown>): string {
  const { hash: _hash, backendAcks: _acks, teeSignature: _tee, ...content } = record;
  return hashCanonicalPayload(content);
}

/**
 * Verify a contiguous sequence in chain order (ascending seq).
 * Default `requireGenesis` is false so a retained ring-buffer window still verifies.
 */
export function verifyHashChain(
  records: ReadonlyArray<HashChainLink & Record<string, unknown>>,
  options: { requireGenesis?: boolean } = {}
): HashChainVerifyResult {
  const requireGenesis = options.requireGenesis ?? false;
  if (records.length === 0) {
    return {
      ok: true,
      records: 0,
      head_hash: HASH_CHAIN_GENESIS,
      fromGenesis: true,
      issues: [],
    };
  }

  const issues: HashChainVerifyIssue[] = [];
  const fromGenesis = records[0]!.prev_hash === HASH_CHAIN_GENESIS;
  if (requireGenesis && !fromGenesis) {
    issues.push({
      seq: records[0]!.seq,
      reason: "chain does not start at genesis",
    });
  }

  let expectedPrev = records[0]!.prev_hash;
  let expectedSeq = records[0]!.seq;

  for (const record of records) {
    if (record.seq !== expectedSeq) {
      issues.push({
        seq: record.seq,
        reason: `expected seq ${expectedSeq}, got ${record.seq}`,
      });
    }
    if (record.prev_hash !== expectedPrev) {
      issues.push({
        seq: record.seq,
        reason: `prev_hash mismatch at seq ${record.seq}`,
      });
    }
    const recomputed = recomputeHash(record);
    if (record.hash !== recomputed) {
      issues.push({
        seq: record.seq,
        reason: `hash mismatch at seq ${record.seq}`,
      });
    }
    expectedPrev = record.hash;
    expectedSeq = record.seq + 1;
  }

  return {
    ok: issues.length === 0,
    records: records.length,
    head_hash: records[records.length - 1]!.hash,
    fromGenesis,
    issues,
  };
}
