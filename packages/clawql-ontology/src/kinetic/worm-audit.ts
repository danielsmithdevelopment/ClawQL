/**
 * In-memory kinetic audit / mini WORM chain for LOW Transaction Sandbox (essay 3.3).
 */

import { createHash } from "node:crypto";

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
  prevHash: string | null;
  hash: string;
};

const MAX = 256;
const ring: KineticAuditEntry[] = [];
let lastHash: string | null = null;
let seq = 0;

function hashEntry(payload: Omit<KineticAuditEntry, "hash">): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function appendKineticAudit(
  input: Omit<KineticAuditEntry, "id" | "ts" | "prevHash" | "hash">
): KineticAuditEntry {
  seq += 1;
  const base = {
    id: `kinetic-${seq}`,
    ts: new Date().toISOString(),
    prevHash: lastHash,
    ...input,
  };
  const entry: KineticAuditEntry = { ...base, hash: hashEntry(base) };
  lastHash = entry.hash;
  ring.push(entry);
  if (ring.length > MAX) ring.shift();
  return entry;
}

export function listKineticAudit(limit = 50): KineticAuditEntry[] {
  return ring.slice(-limit);
}

export function resetKineticAuditForTests(): void {
  ring.length = 0;
  lastHash = null;
  seq = 0;
}
