import { postMcpToolsCall, runWitnessHandler } from "@/lib/managed/e2e/handlers";

export const dynamic = "force-dynamic";

/** Production-shaped MCP tools/call. */
export async function POST(req: Request) {
  return runWitnessHandler(postMcpToolsCall, req);
}
