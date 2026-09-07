/**
 * Quote digest + atomic↔decimal helpers for outbound x402.
 */

import { createHash } from "node:crypto";
import { Effect } from "effect";
import { OutboundPolicyError, parseUsdcToAtomic, type OutboundPaymentQuote } from "clawql-core";
import type { OutboundX402QuoteTerms } from "./types.js";

const USDC_SCALE = 1_000_000n;

export function atomicToUsdcDecimal(atomic: string): Effect.Effect<string, OutboundPolicyError> {
  return Effect.gen(function* () {
    const trimmed = atomic.trim();
    if (!/^\d+$/.test(trimmed)) {
      return yield* Effect.fail(
        new OutboundPolicyError({ reason: `invalid_atomic_amount:${atomic}` })
      );
    }
    const n = BigInt(trimmed);
    const whole = n / USDC_SCALE;
    const frac = (n % USDC_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
    return frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
  });
}

export function computeQuoteDigest(terms: OutboundX402QuoteTerms): string {
  const canonical = JSON.stringify({
    scheme: terms.scheme,
    network: terms.network,
    amountAtomic: terms.amountAtomic,
    asset: terms.asset.toLowerCase(),
    payTo: terms.payTo.toLowerCase(),
    maxTimeoutSeconds: terms.maxTimeoutSeconds ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function quoteFromTerms(
  terms: OutboundX402QuoteTerms
): Effect.Effect<OutboundPaymentQuote, OutboundPolicyError> {
  return Effect.gen(function* () {
    const amountUsdc = yield* atomicToUsdcDecimal(terms.amountAtomic);
    const digest = computeQuoteDigest(terms);
    return {
      payTo: terms.payTo,
      network: terms.network,
      asset: terms.asset,
      amountUsdc,
      digest,
    } satisfies OutboundPaymentQuote;
  });
}

/** Hash request body for idempotency binding. */
export function bodyHash(body: string | undefined): string {
  return createHash("sha256")
    .update(body ?? "")
    .digest("hex");
}

export function idempotencyKey(input: {
  tenantId: string;
  agentId: string;
  resourceUrl: string;
  method: string;
  bodyHash: string;
  quoteDigest: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.tenantId,
        input.agentId,
        input.resourceUrl,
        input.method.toUpperCase(),
        input.bodyHash,
        input.quoteDigest,
      ].join("|")
    )
    .digest("hex");
}

/** Re-export for callers that already have decimal. */
export { parseUsdcToAtomic };
