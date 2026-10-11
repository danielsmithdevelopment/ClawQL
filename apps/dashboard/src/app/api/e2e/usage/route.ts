import { getBillingUsage, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange/fault façade — prefer production-shaped GET /billing/usage for Pass-when. */
export async function GET(req: Request) {
  return runWitnessHandler(getBillingUsage, req);
}
