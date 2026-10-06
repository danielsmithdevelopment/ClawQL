import { postChatCompletions, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/**
 * Arrange/fault façade — prefer production-shaped POST /v1/chat/completions for Pass-when.
 * Kept for harness arrange paths until /api/e2e is removed.
 */
export async function POST(req: Request) {
  return runWitnessHandler(postChatCompletions, req);
}
