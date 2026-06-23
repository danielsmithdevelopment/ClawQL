/**
 * memory_recall MCP tool — transport handler; core logic in `clawql-memory/recall/recall`.
 */

export {
  extractWikilinkTargets,
  keywordScore,
  runMemoryRecall,
  type MemoryRecallInput,
  type MemoryRecallResult,
  type RecallHit,
} from "clawql-memory/recall/recall";

import { runMemoryRecall, type MemoryRecallInput } from "clawql-memory/recall/recall";
import { logMcpToolShape } from "./mcp-tool-log.js";

export async function handleMemoryRecallToolInput(
  params: MemoryRecallInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("memory_recall", {
    queryChars: params.query?.length ?? 0,
    limit: params.limit,
    maxDepth: params.maxDepth,
    minScore: params.minScore,
  });
  const result = await runMemoryRecall(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
