import { buildX402PaymentReceivedEntry } from "../audit/events.js";
import { appendPaymentWormEntry } from "../audit/worm.js";
import type { X402PaymentProof } from "./verify.js";

export type X402Settlement = {
  id: string;
  txHash?: string;
  amountUsdc: number;
  resource: string;
  tenantId: string;
  settledAt: string;
};

export async function reconcileX402Settlement(input: {
  tenantId: string;
  resource: string;
  amountUsdc: number;
  proof: X402PaymentProof;
  correlationId?: string;
}): Promise<X402Settlement> {
  const settlement: X402Settlement = {
    id: `x402_${Date.now().toString(36)}`,
    txHash: input.proof.txHash,
    amountUsdc: input.amountUsdc,
    resource: input.resource,
    tenantId: input.tenantId,
    settledAt: new Date().toISOString(),
  };

  appendPaymentWormEntry(
    buildX402PaymentReceivedEntry({
      tenantId: input.tenantId,
      amountUsdc: input.amountUsdc,
      resource: input.resource,
      agentId: input.proof.payer,
      correlationId: input.correlationId,
    })
  );

  return settlement;
}
