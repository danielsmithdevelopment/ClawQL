import { postBillingCheckout, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Production-shaped Stripe Checkout completion.
 * Pass-when via /audit + console UI — not /api/e2e/stripe/checkout.
 */
export async function POST(req: Request) {
  return runWitnessHandler(postBillingCheckout, req);
}
