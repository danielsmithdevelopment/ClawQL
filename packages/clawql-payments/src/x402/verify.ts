/**
 * Lightweight proof shape helpers. Cryptographic verification belongs to the
 * facilitator (audit 6.01) — this module must not treat a non-empty signature
 * as payment.
 */

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

/**
 * Structural checks only. Never returns valid for signature-only proofs unless
 * `CLAWQL_X402_ALLOW_INSECURE_PROOF=1` (unit tests). Production gates must use
 * the facilitator verify + settle path.
 */
export function verifyX402PaymentProof(
  proof: X402PaymentProof,
  env: NodeJS.ProcessEnv = process.env
): X402VerifyResult {
  if (!proof.txHash && !proof.signature) {
    return { valid: false, reason: "missing payment proof (txHash or signature required)" };
  }
  if (proof.amount !== undefined && proof.amount <= 0) {
    return { valid: false, reason: "invalid payment amount" };
  }
  const insecure = env.CLAWQL_X402_ALLOW_INSECURE_PROOF?.trim() === "1";
  if (!proof.txHash && proof.signature && !insecure) {
    return {
      valid: false,
      reason:
        "signature-only proofs require facilitator verify/settle (set CLAWQL_X402_ALLOW_INSECURE_PROOF=1 for tests only)",
    };
  }
  if (!insecure && !proof.txHash) {
    return {
      valid: false,
      reason: "verifyX402PaymentProof is not a substitute for facilitator settlement",
    };
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
