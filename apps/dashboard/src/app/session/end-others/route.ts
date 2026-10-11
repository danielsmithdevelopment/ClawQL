import { postSessionEndOthers, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped “sign out everywhere else”. Pass-when via /audit + Profile. */
export async function POST(req: Request) {
  return runWitnessHandler(postSessionEndOthers, req);
}
