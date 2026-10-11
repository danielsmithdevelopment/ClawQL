import { postBillingCheckout, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange/fault façade — prefer production-shaped POST /billing/checkout for Pass-when. */
export async function POST(req: Request) {
  return runWitnessHandler(postBillingCheckout, req);
}
