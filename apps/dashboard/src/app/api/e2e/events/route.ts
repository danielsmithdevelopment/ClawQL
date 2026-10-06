import { getEvents, postEvents, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Arrange/fault façade — prefer production-shaped /events for Pass-when.
 * Kept for harness arrange paths until /api/e2e is removed.
 */
export async function GET(req: Request) {
  return runWitnessHandler(getEvents, req);
}

export async function POST(req: Request) {
  return runWitnessHandler(postEvents, req);
}
