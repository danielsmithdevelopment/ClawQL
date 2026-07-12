import {
  PAYMENT_AUDIT_GENESIS_HASH,
  sealPaymentWormRecord,
  toPaymentWormEntry,
  verifyPaymentAuditChain,
  type PaymentAuditVerifyResult,
  type PaymentWormRecord,
} from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import type { PaymentAuditStore } from "./store.js";

export class MemoryPaymentAuditStore implements PaymentAuditStore {
  private records: PaymentWormRecord[] = [];

  append(entry: PaymentWormEntry): PaymentWormRecord {
    const prev_hash =
      this.records.length > 0 ? this.records[this.records.length - 1]!.hash : PAYMENT_AUDIT_GENESIS_HASH;
    const record = sealPaymentWormRecord({
      entry,
      seq: this.records.length + 1,
      prev_hash,
    });
    this.records.push(record);
    return record;
  }

  list(limit = 100): PaymentWormEntry[] {
    return this.listRecords(limit).map(toPaymentWormEntry);
  }

  listRecords(limit = 100): PaymentWormRecord[] {
    if (limit <= 0) return [];
    return this.records.slice(-limit);
  }

  verify(): PaymentAuditVerifyResult {
    return verifyPaymentAuditChain(this.records);
  }

  reset(): void {
    this.records = [];
  }
}
