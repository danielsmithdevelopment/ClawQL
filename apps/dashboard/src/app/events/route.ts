import { getEvents, postEvents, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped events list / emit. */
export async function GET(req: Request) {
  return runWitnessHandler(getEvents, req);
}

export async function POST(req: Request) {
  return runWitnessHandler(postEvents, req);
}
