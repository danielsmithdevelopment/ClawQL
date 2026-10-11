import { getSession, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped session snapshot for Profile UI. */
export async function GET(req: Request) {
  return runWitnessHandler(getSession, req);
}
