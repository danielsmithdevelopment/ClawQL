import { getBillingUsage, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped usage/billing snapshot. Pass-when for ADM-* spend witnesses. */
export async function GET(req: Request) {
  return runWitnessHandler(getBillingUsage, req);
}
