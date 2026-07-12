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

  async append(entry: PaymentWormEntry): Promise<PaymentWormRecord> {
    const prev_hash =
      this.records.length > 0
        ? this.records[this.records.length - 1]!.hash
        : PAYMENT_AUDIT_GENESIS_HASH;
    const record = sealPaymentWormRecord({
      entry,
      seq: this.records.length + 1,
      prev_hash,
    });
    this.records.push(record);
    return record;
  }

  async list(limit = 100): Promise<PaymentWormEntry[]> {
    return (await this.listRecords(limit)).map(toPaymentWormEntry);
  }

  async listRecords(limit = 100): Promise<PaymentWormRecord[]> {
    if (limit <= 0) return [];
    return this.records.slice(-limit);
  }

  async verify(): Promise<PaymentAuditVerifyResult> {
    return verifyPaymentAuditChain(this.records);
  }

  async reset(): Promise<void> {
    this.records = [];
  }
}
