/**
 * memory_ingest MCP tool — transport handler; core logic in `clawql-memory/ingest/ingest`.
 */

export {
  slugifyTitle,
  extractIngestHashes,
  hashIngestSection,
  runMemoryIngest,
  type EnterpriseCitation,
  type MemoryIngestInput,
  type MemoryIngestResult,
  type MerkleSnapshotPayload,
} from "clawql-memory/ingest/ingest";

import { runMemoryIngest, type MemoryIngestInput } from "clawql-memory/ingest/ingest";
import { logMcpToolShape } from "./mcp-tool-log.js";

export async function handleMemoryIngestToolInput(
  params: MemoryIngestInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const result = await runMemoryIngest(params);
  logMcpToolShape("memory_ingest", {
    titleChars: params.title?.length ?? 0,
    append: params.append,
    hasInsights: Boolean(params.insights?.trim()),
    enterpriseCitationCount: params.enterpriseCitations?.length ?? 0,
    hasConversation: Boolean(params.conversation?.trim()),
    hasToolOutputsFile: Boolean(params.toolOutputsFile?.trim()),
    hasToolOutputs: Boolean(
      typeof params.toolOutputs === "string"
        ? params.toolOutputs.trim()
        : params.toolOutputs?.some((s) => s.trim())
    ),
    wikilinkCount: params.wikilinks?.length ?? 0,
    hasSessionId: Boolean(params.sessionId?.trim()),
    ok: result.ok,
    skipped: result.skipped,
    merkleRootChanged: result.merkleRootChanged,
    hasMerkleSnapshot: Boolean(result.merkleSnapshot),
    cuckooMembershipReady: result.cuckooMembershipReady,
  });
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
