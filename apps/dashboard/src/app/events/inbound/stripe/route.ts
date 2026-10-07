import { postStripeInbound, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Stripe listen target: checkout.session.completed → provision (idempotent).
 * `stripe listen --forward-to http://localhost:3000/events/inbound/stripe`
 */
export async function POST(req: Request) {
  return runWitnessHandler(postStripeInbound, req);
}
