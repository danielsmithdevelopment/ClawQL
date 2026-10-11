import { getDecision, postDecision, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Arrange/fault façade — prefer production-shaped POST /decision for Pass-when. */
export async function POST(req: Request) {
  return runWitnessHandler(postDecision, req);
}

export async function GET(req: Request) {
  return runWitnessHandler(getDecision, req);
}
