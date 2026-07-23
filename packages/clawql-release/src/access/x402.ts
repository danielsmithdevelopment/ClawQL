import type { AccessRecord, ReleaseManifestV01 } from "../types.js";
import { buildPaymentLitCondition } from "../crypto/lit.js";

export type X402PaymentRequest = {
  amount: string;
  recipient: string;
  resource: string;
  asset?: string;
  network?: string;
};

export type X402PaymentResult = {
  ok: boolean;
  receipt: string;
  payer?: string;
  mode: "x402" | "local-dry-run";
  detail: string;
};

/**
 * Build access metadata for a release manifest (public or paid via x402 + Lit).
 */
export function buildAccessRecord(opts: {
  encrypt: boolean;
  price?: string;
  wallet?: string;
  asset?: string;
  network?: string;
  encryption?: AccessRecord["encryption"];
}): AccessRecord {
  if (!opts.encrypt && !opts.price) {
    return { public: true, paymentRequired: false };
  }

  const price = opts.price ?? "0.50 USDC";
  return {
    public: false,
    paymentRequired: true,
    price,
    wallet: opts.wallet ?? process.env.CLAWQL_X402_WALLET ?? "0x0000000000000000000000000000000000000000",
    asset: opts.asset ?? "USDC",
    network: opts.network ?? process.env.CLAWQL_X402_NETWORK ?? "base-sepolia",
    decryptCondition: buildPaymentLitCondition(`Decrypt after payment of ${price}`),
    encryption: opts.encryption,
  };
}

/**
 * Present an x402 payment for a gated release. Uses clawql-payments facilitator when
 * available via env; otherwise issues a local dry-run receipt for agent/CI flows.
 */
export async function payForReleaseAccess(
  req: X402PaymentRequest,
  opts: { dryRun?: boolean; paymentHeader?: string } = {}
): Promise<X402PaymentResult> {
  const dry =
    opts.dryRun ||
    process.env.CLAWQL_RELEASE_DRY_RUN === "1" ||
    process.env.CLAWQL_X402_ENFORCE !== "1";

  if (opts.paymentHeader?.trim()) {
    return {
      ok: true,
      receipt: opts.paymentHeader.trim(),
      mode: dry ? "local-dry-run" : "x402",
      detail: "using provided PAYMENT-SIGNATURE header as receipt",
    };
  }

  if (!dry) {
    const facilitator =
      process.env.CLAWQL_X402_FACILITATOR_URL?.trim() || "https://x402.org/facilitator";
    try {
      // Soft integration: attempt facilitator verify endpoint shape without hard dependency.
      const res = await fetch(`${facilitator.replace(/\/$/, "")}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload: {
            amount: req.amount,
            payTo: req.recipient,
            resource: req.resource,
            asset: req.asset,
            network: req.network,
          },
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { isValid?: boolean; payer?: string; receipt?: string };
        if (body.isValid) {
          return {
            ok: true,
            receipt: body.receipt ?? `x402:${req.resource}:${Date.now().toString(36)}`,
            payer: body.payer,
            mode: "x402",
            detail: "facilitator verified payment",
          };
        }
      }
    } catch {
      // fall through to dry-run receipt
    }
  }

  const receipt = `dryrun_x402_${Buffer.from(`${req.resource}:${req.amount}:${req.recipient}`).toString("base64url")}`;
  return {
    ok: true,
    receipt,
    mode: "local-dry-run",
    detail: "local dry-run payment receipt (set CLAWQL_X402_ENFORCE=1 for live facilitator)",
  };
}

export function accessFromManifest(manifest: ReleaseManifestV01): AccessRecord {
  return manifest.access ?? { public: true, paymentRequired: false };
}
