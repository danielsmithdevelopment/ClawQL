import { postGatewayRestart, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Production-shaped gateway restart (preserves sessions/review).
 * Compose multi-replica kill is the next honesty step; this replaces control simulate.
 */
export async function POST(req: Request) {
  return runWitnessHandler(postGatewayRestart, req);
}
