import { getBillingEntitlements, runWitnessHandler } from "@/lib/managed/e2e/handlers";

/** Production-shaped plan entitlements snapshot (Stripe or store_iap). */
export async function GET(req: Request) {
  return runWitnessHandler(getBillingEntitlements, req);
}
