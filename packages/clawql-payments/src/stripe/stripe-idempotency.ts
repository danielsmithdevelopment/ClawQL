/**
 * Stripe idempotency write-ahead helpers.
 *
 * Recovery model (same as journal write-intent):
 * 1. Persist a durable key derived from a durable id (checkout session / top-up id)
 * 2. Call Stripe with that key as Idempotency-Key
 * 3. Record the PaymentIntent id
 * 4. Retries reuse the same key; Stripe returns the original PI (~24h window)
 * 5. After the window, look up by metadata before creating anything new
 */

import type Stripe from "stripe";

export const STRIPE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function stripeIdempotencyKeyForAcpComplete(checkoutSessionId: string): string {
  return `clawql-acp-complete:${checkoutSessionId.trim()}`;
}

export function stripeIdempotencyKeyForAchTopup(durableTopupId: string): string {
  return `clawql-ach-topup:${durableTopupId.trim()}`;
}

/** True when a write-ahead key is older than Stripe's ~24h idempotency window. */
export function stripeIdempotencyKeyLikelyExpired(
  writtenAtIso: string,
  nowMs: number = Date.now()
): boolean {
  const t = Date.parse(writtenAtIso);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > STRIPE_IDEMPOTENCY_TTL_MS;
}

/**
 * After the idempotency window, recover an existing PaymentIntent by metadata
 * instead of creating a second charge (check-then-decide).
 */
export async function findPaymentIntentByMetadata(
  stripe: Stripe,
  metadataEquals: Readonly<Record<string, string>>
): Promise<Stripe.PaymentIntent | null> {
  const keys = Object.keys(metadataEquals);
  if (keys.length === 0) return null;
  // Stripe list does not filter arbitrary metadata server-side for all accounts;
  // search API is the supported path when available.
  const clauses = keys.map((k) => `metadata["${k}"]:"${metadataEquals[k]!.replace(/"/g, "")}"`);
  const query = `created>0 AND ${clauses.join(" AND ")}`;
  try {
    const found = await stripe.paymentIntents.search({ query, limit: 1 });
    return found.data[0] ?? null;
  } catch {
    // Search may be unavailable on some accounts/regions — caller must not create
    // a second PI without an explicit operator path.
    return null;
  }
}
