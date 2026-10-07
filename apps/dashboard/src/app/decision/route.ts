import { getDecision, postDecision, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped decision sites. Pass-when via /audit (SI-07, GW-*). */
export async function POST(req: Request) {
  return runWitnessHandler(postDecision, req);
}

export async function GET(req: Request) {
  return runWitnessHandler(getDecision, req);
}
