import { postChatCompletions, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped OpenAI-compatible chat completions. */
export async function POST(req: Request) {
  return runWitnessHandler(postChatCompletions, req);
}
