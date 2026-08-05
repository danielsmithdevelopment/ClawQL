import { createHash } from "node:crypto";
import type { PaymentWormEntry } from "./events.js";

export const PAYMENT_AUDIT_GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

export type PaymentWormRecord = PaymentWormEntry & {
  seq: number;
  prev_hash: string;
  hash: string;
};

export type PaymentAuditChainLink = Omit<PaymentWormRecord, "hash">;

export function canonicalPaymentAuditBytes(link: PaymentAuditChainLink): Buffer {
  const body = JSON.stringify({
    seq: link.seq,
    prev_hash: link.prev_hash,
    ts: link.ts,
    category: link.category,
    action: link.action,
    summary: link.summary,
    correlationId: link.correlationId ?? null,
    payload: link.payload,
  });
  return Buffer.from(body, "utf8");
}

export function hashPaymentAuditLink(link: PaymentAuditChainLink): string {
  return createHash("sha256").update(canonicalPaymentAuditBytes(link)).digest("hex");
}

export function sealPaymentWormRecord(input: {
  entry: PaymentWormEntry;
  seq: number;
  prev_hash: string;
}): PaymentWormRecord {
  const link: PaymentAuditChainLink = {
    ...input.entry,
    seq: input.seq,
    prev_hash: input.prev_hash,
  };
  return {
    ...link,
    hash: hashPaymentAuditLink(link),
  };
}

export type PaymentAuditVerifyIssue = {
  seq: number;
  reason: string;
};

export type PaymentAuditVerifyResult = {
  ok: boolean;
  records: number;
  head_hash: string;
  issues: PaymentAuditVerifyIssue[];
};

export function verifyPaymentAuditChain(records: PaymentWormRecord[]): PaymentAuditVerifyResult {
  const issues: PaymentAuditVerifyIssue[] = [];
  let expectedSeq = 1;
  let prevHash = PAYMENT_AUDIT_GENESIS_HASH;

  for (const record of records) {
    if (record.seq !== expectedSeq) {
      issues.push({
        seq: record.seq,
        reason: `expected seq ${expectedSeq}, got ${record.seq}`,
      });
    }
    if (record.prev_hash !== prevHash) {
      issues.push({
        seq: record.seq,
        reason: `prev_hash mismatch at seq ${record.seq}`,
      });
    }
    const recomputed = hashPaymentAuditLink(record);
    if (record.hash !== recomputed) {
      issues.push({
        seq: record.seq,
        reason: `hash mismatch at seq ${record.seq}`,
      });
    }
    prevHash = record.hash;
    expectedSeq += 1;
  }

  return {
    ok: issues.length === 0,
    records: records.length,
    head_hash: records.length > 0 ? records[records.length - 1]!.hash : PAYMENT_AUDIT_GENESIS_HASH,
    issues,
  };
}

export function toPaymentWormEntry(record: PaymentWormRecord): PaymentWormEntry {
  return {
    ts: record.ts,
    category: record.category,
    action: record.action,
    summary: record.summary,
    correlationId: record.correlationId,
    payload: record.payload,
    accounting: record.accounting,
  };
}
