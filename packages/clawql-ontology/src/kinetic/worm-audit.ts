/**
 * In-memory kinetic audit / mini WORM chain for LOW Transaction Sandbox (essay 3.3).
 */

import {
  HASH_CHAIN_GENESIS,
  sealHashChainRecord,
  verifyHashChain,
  type HashChainVerifyResult,
} from "clawql-core";

export type KineticAuditAction = "KINETIC_COMMITTED" | "KINETIC_DENIED";

export type KineticAuditEntry = {
  id: string;
  ts: string;
  action: KineticAuditAction;
  tool: string;
  entity: string;
  recordId: string;
  subject?: string;
  reason?: string;
  snapshot?: { field: string; before: unknown; after?: unknown };
  executor?: string;
  seq: number;
  prev_hash: string;
  hash: string;
  /** @deprecated Use prev_hash */
  prevHash: string | null;
};

const MAX = 256;
const ring: KineticAuditEntry[] = [];
let lastHash = HASH_CHAIN_GENESIS;
let seq = 0;

export function appendKineticAudit(
  input: Omit<KineticAuditEntry, "id" | "ts" | "prevHash" | "prev_hash" | "hash" | "seq">
): KineticAuditEntry {
  seq += 1;
  const prev_hash = lastHash;
  const sealed = sealHashChainRecord(
    {
      id: `kinetic-${seq}`,
      ts: new Date().toISOString(),
      action: input.action,
      tool: input.tool,
      entity: input.entity,
      recordId: input.recordId,
      prevHash: prev_hash === HASH_CHAIN_GENESIS ? null : prev_hash,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
      ...(input.executor !== undefined ? { executor: input.executor } : {}),
    },
    seq,
    prev_hash
  );
  const entry: KineticAuditEntry = sealed;
  lastHash = entry.hash;
  ring.push(entry);
  if (ring.length > MAX) ring.shift();
  return entry;
}

export function listKineticAudit(limit = 50): KineticAuditEntry[] {
  return ring.slice(-limit);
}

export function verifyKineticAudit(): HashChainVerifyResult {
  return verifyHashChain(ring, { requireGenesis: false });
}

export function resetKineticAuditForTests(): void {
  ring.length = 0;
  lastHash = HASH_CHAIN_GENESIS;
  seq = 0;
}
