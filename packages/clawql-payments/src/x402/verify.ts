export type X402PaymentProof = {
  txHash?: string;
  signature?: string;
  payer?: string;
  amount?: number;
  asset?: string;
  resource?: string;
};

export type X402VerifyResult =
  | { valid: true; payer?: string; amount?: number; asset?: string }
  | { valid: false; reason: string };

export function verifyX402PaymentProof(proof: X402PaymentProof): X402VerifyResult {
  if (!proof.txHash && !proof.signature) {
    return { valid: false, reason: "missing payment proof (txHash or signature required)" };
  }
  if (proof.amount !== undefined && proof.amount <= 0) {
    return { valid: false, reason: "invalid payment amount" };
  }
  return {
    valid: true,
    payer: proof.payer,
    amount: proof.amount,
    asset: proof.asset,
  };
}

export function parseX402ProofHeader(headerValue: string | undefined): X402PaymentProof {
  if (!headerValue?.trim()) return {};
  try {
    return JSON.parse(headerValue) as X402PaymentProof;
  } catch {
    return { signature: headerValue.trim() };
  }
}
