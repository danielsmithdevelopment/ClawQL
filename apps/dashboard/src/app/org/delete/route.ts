import { postOrgDelete, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Production-shaped org delete (fresh sign-in gate + key step-up).
 * Pass-when asserts /audit + Settings UI — not /api/e2e/control.
 */
export async function POST(req: Request) {
  return runWitnessHandler(postOrgDelete, req);
}
