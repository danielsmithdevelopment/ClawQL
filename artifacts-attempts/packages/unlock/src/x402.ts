/**
 * Minimal x402 challenge / verify shapes for Workers.
 * Live path: Coinbase / x402.org facilitator. Offline: dry-run receipt.
 */

export type X402Challenge = {
  x402Version: 2;
  accepts: Array<{
    scheme: "exact";
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
  }>;
};

export type X402VerifyResult = {
  ok: boolean;
  mode: "x402" | "dry-run";
  receipt: string;
  payer?: string;
  detail: string;
};

export function buildPaymentRequired(input: {
  resource: string;
  payTo: string;
  /** USDC atomic units as string, e.g. "10000" = $0.01 on 6-decimal USDC */
  maxAmountRequired: string;
  network?: string;
  asset?: string;
  description?: string;
}): X402Challenge {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: input.network ?? "base-sepolia",
        maxAmountRequired: input.maxAmountRequired,
        resource: input.resource,
        description: input.description ?? "Decrypt + private Artifacts buyer copy",
        mimeType: "application/json",
        payTo: input.payTo,
        maxTimeoutSeconds: 300,
        asset: input.asset ?? "USDC",
      },
    ],
  };
}

export function paymentRequiredHeaders(body: X402Challenge): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(body)).toString("base64url"),
  };
}

/**
 * Verify a payment proof. Dry-run accepts `X-Unlock-Dry-Run: 1` or missing live facilitator.
 * Live: POST facilitator `/verify` when `X402_FACILITATOR_URL` is set and dry-run is off.
 */
export async function verifyPayment(input: {
  resource: string;
  paymentHeader?: string | null;
  dryRun?: boolean;
  facilitatorUrl?: string;
  challenge: X402Challenge;
}): Promise<X402VerifyResult> {
  const dry =
    input.dryRun === true ||
    process.env.X402_DRY_RUN === "1" ||
    process.env.ATTEMPTS_UNLOCK_DRY_RUN === "1";

  if (dry) {
    const receipt = input.paymentHeader?.trim() || `dry_${Date.now().toString(36)}`;
    return {
      ok: true,
      mode: "dry-run",
      receipt,
      payer: "dry-run-buyer",
      detail: "local dry-run receipt (label on camera)",
    };
  }

  const header = input.paymentHeader?.trim();
  if (!header) {
    return { ok: false, mode: "x402", receipt: "", detail: "missing PAYMENT-SIGNATURE header" };
  }

  const facilitator =
    input.facilitatorUrl?.trim() ||
    process.env.X402_FACILITATOR_URL?.trim() ||
    "https://x402.org/facilitator";

  try {
    const res = await fetch(`${facilitator.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentHeader: header,
        paymentRequirements: input.challenge.accepts[0],
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        mode: "x402",
        receipt: "",
        detail: `facilitator HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      isValid?: boolean;
      payer?: string;
      receipt?: string;
    };
    if (!body.isValid) {
      return { ok: false, mode: "x402", receipt: "", detail: "facilitator rejected payment" };
    }
    return {
      ok: true,
      mode: "x402",
      receipt: body.receipt ?? header.slice(0, 64),
      payer: body.payer,
      detail: "facilitator verified",
    };
  } catch (err) {
    return {
      ok: false,
      mode: "x402",
      receipt: "",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
