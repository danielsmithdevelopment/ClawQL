import { getAudit, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Production-shaped audit export (supports ?format=ocsf).
 * Browser document navigations to `/audit` are rewritten to the console UI
 * via `src/middleware.ts` so this route does not conflict with the page.
 */
export async function GET(req: Request) {
  return runWitnessHandler(getAudit, req);
}
