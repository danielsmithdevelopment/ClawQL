import { postBillingStoreVerify, runWitnessHandler } from "@/lib/managed/e2e/handlers";

/** Production-shaped store IAP verify (fixture harness). Pass-when via /billing/entitlements + /audit. */
export async function POST(req: Request) {
  return runWitnessHandler(postBillingStoreVerify, req);
}
