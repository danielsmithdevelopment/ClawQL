import { postBillingCredits, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped credit top-up. Pass-when via /billing/usage + /audit. */
export async function POST(req: Request) {
  return runWitnessHandler(postBillingCredits, req);
}
