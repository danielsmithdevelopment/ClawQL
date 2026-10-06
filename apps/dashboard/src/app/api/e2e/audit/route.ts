import { getAudit, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Arrange/fault façade — prefer production-shaped GET /audit for Pass-when.
 * Kept for harness arrange paths until /api/e2e is removed.
 */
export async function GET(req: Request) {
  return runWitnessHandler(getAudit, req);
}
