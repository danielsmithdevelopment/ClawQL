/**
 * Stripe idempotency write-ahead helpers.
 *
 * Recovery model (same as journal write-intent):
 * 1. Persist a durable key derived from a durable id (checkout session / top-up id / MPP challenge)
 * 2. Call Stripe with that key as Idempotency-Key
 * 3. Record the PaymentIntent id
 * 4. Retries reuse the same key; Stripe returns the original PI (~24h window)
 * 5. After the window, look up by metadata before creating anything new
 * 6. If metadata search is unavailable, fail closed (never create a second charge)
 */

import type Stripe from "stripe";

export const STRIPE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function stripeIdempotencyKeyForAcpComplete(checkoutSessionId: string): string {
  return `clawql-acp-complete:${checkoutSessionId.trim()}`;
}

export function stripeIdempotencyKeyForAchTopup(durableTopupId: string): string {
  return `clawql-ach-topup:${durableTopupId.trim()}`;
}

export function stripeIdempotencyKeyForMpp(durableMppId: string): string {
  return `clawql-mpp:${durableMppId.trim()}`;
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

export type PaymentIntentMetadataLookup =
  | { readonly status: "found"; readonly intent: Stripe.PaymentIntent }
  | { readonly status: "not_found" }
  | { readonly status: "search_unavailable"; readonly cause: unknown };

/**
 * After the idempotency window, recover an existing PaymentIntent by metadata
 * instead of creating a second charge (check-then-decide).
 *
 * `search_unavailable` must fail closed — do not create a new PI.
 * `not_found` after a successful search means no prior charge (safe to create once).
 */
export async function lookupPaymentIntentByMetadata(
  stripe: Stripe,
  metadataEquals: Readonly<Record<string, string>>
): Promise<PaymentIntentMetadataLookup> {
  const keys = Object.keys(metadataEquals);
  if (keys.length === 0) return { status: "not_found" };
  const clauses = keys.map((k) => `metadata["${k}"]:"${metadataEquals[k]!.replace(/"/g, "")}"`);
  const query = `created>0 AND ${clauses.join(" AND ")}`;
  try {
    const found = await stripe.paymentIntents.search({ query, limit: 1 });
    const intent = found.data[0];
    return intent ? { status: "found", intent } : { status: "not_found" };
  } catch (cause) {
    return { status: "search_unavailable", cause };
  }
}

/** @deprecated Prefer lookupPaymentIntentByMetadata (distinguishes search failure). */
export async function findPaymentIntentByMetadata(
  stripe: Stripe,
  metadataEquals: Readonly<Record<string, string>>
): Promise<Stripe.PaymentIntent | null> {
  const result = await lookupPaymentIntentByMetadata(stripe, metadataEquals);
  return result.status === "found" ? result.intent : null;
}

/**
 * Post-TTL recovery: reuse found PI; allow create only on definitive not_found;
 * fail closed when Stripe Search is unavailable.
 */
export function decidePostTtlPaymentIntentAction(
  lookup: PaymentIntentMetadataLookup
):
  | { readonly action: "reuse"; readonly intent: Stripe.PaymentIntent }
  | { readonly action: "create" }
  | { readonly action: "fail_closed"; readonly reason: string } {
  if (lookup.status === "found") {
    return { action: "reuse", intent: lookup.intent };
  }
  if (lookup.status === "not_found") {
    return { action: "create" };
  }
  return {
    action: "fail_closed",
    reason:
      "Stripe PaymentIntent metadata search unavailable after idempotency TTL — refusing to create a second charge; verify the dashboard then retry",
  };
}
