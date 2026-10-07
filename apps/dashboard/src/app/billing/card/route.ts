import { postBillingCard, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped card update. Pass-when via /billing/usage + /audit. */
export async function POST(req: Request) {
  return runWitnessHandler(postBillingCard, req);
}
