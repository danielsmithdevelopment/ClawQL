import type { MppPaymentMethod } from "./types.js";

export type MppPaymentReceipt = {
  method: MppPaymentMethod;
  resource: string;
  settledAt: string;
  payer?: string;
  settlementId?: string;
  stripePaymentIntentId?: string;
  x402SettlementId?: string;
};

export function buildMppPaymentReceipt(input: MppPaymentReceipt): Record<string, unknown> {
  return {
    version: "1",
    method: input.method,
    resource: input.resource,
    settledAt: input.settledAt,
    ...(input.payer ? { payer: input.payer } : {}),
    ...(input.settlementId ? { settlementId: input.settlementId } : {}),
    ...(input.stripePaymentIntentId
      ? { stripe: { paymentIntentId: input.stripePaymentIntentId } }
      : {}),
    ...(input.x402SettlementId ? { x402: { settlementId: input.x402SettlementId } } : {}),
  };
}

export function mppPaymentReceiptHeader(receipt: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(receipt), "utf8").toString("base64url");
}
