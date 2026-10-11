import { postSessionEnforce, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped idle/max session enforcement. Pass-when via /audit + Profile. */
export async function POST(req: Request) {
  return runWitnessHandler(postSessionEnforce, req);
}
