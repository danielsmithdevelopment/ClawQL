import { postMcpToolsList, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped MCP tools/list. */
export async function POST(req: Request) {
  return runWitnessHandler(postMcpToolsList, req);
}
