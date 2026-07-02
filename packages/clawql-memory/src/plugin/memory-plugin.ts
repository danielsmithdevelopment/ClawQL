import type { Plugin } from "clawql-core";
import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { Effect } from "effect";
import { z } from "zod";
import { runMemoryIngest, type MemoryIngestInput } from "../ingest/ingest.js";
import { runMemoryRecall, type MemoryRecallInput } from "../recall/recall.js";

export const MEMORY_PLUGIN_ID = "clawql-memory";

const memoryEnterpriseCitationSchema = z.object({
  title: z.string().max(500).optional(),
  url: z.string().max(2048).optional(),
  document_id: z.string().max(200).optional(),
  source: z.string().max(200).optional(),
  snippet: z.string().max(400).optional(),
});

export const memoryIngestToolSchema = {
  title: z
    .string()
    .min(1)
    .describe("Suggested Obsidian page title (used for the file name and heading)."),
  insights: z.string().optional().describe("Key insights to persist."),
  conversation: z.string().optional().describe("Conversation transcript or summary text."),
  toolOutputs: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Tool result body, or a list of results to record."),
  toolOutputsFile: z
    .string()
    .optional()
    .describe(
      "If set, the ClawQL server reads UTF-8 from this file path and uses it as `toolOutputs` (small MCP payload; " +
        "large content does not go through the tool round-trip). File must be under an allowed root " +
        "(`CLAWQL_MEMORY_INGEST_FILE_ROOTS` or, by default, the process current working directory). " +
        "Takes precedence over `toolOutputs` if both are set. Set `CLAWQL_MEMORY_INGEST_FILE=0` to reject."
    ),
  enterpriseCitations: z
    .array(memoryEnterpriseCitationSchema)
    .max(30)
    .optional()
    .describe(
      "Optional short citation rows (e.g. trimmed from Onyx `knowledge_search_onyx` JSON). " +
        "Stored as a small Markdown block in the vault — not full retrieval payloads (#130)."
    ),
  wikilinks: z
    .array(z.string())
    .optional()
    .describe(
      "Other vault page names to link with Obsidian [[wikilinks]] (plain names; brackets optional)."
    ),
  sessionId: z.string().optional().describe("Optional session label (shown in the note)."),
  append: z
    .boolean()
    .optional()
    .describe(
      "When the page already exists, append a new section (default true). Set false to replace the file."
    ),
};

export const memoryRecallToolSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      "Natural language or keywords to find in vault Markdown (filename + body + headings)."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max notes to return (default: CLAWQL_MEMORY_RECALL_LIMIT or 10)."),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe(
      "How many wikilink hops to follow from keyword hits (default: CLAWQL_MEMORY_RECALL_MAX_DEPTH or 2)."
    ),
  minScore: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Minimum keyword match score to seed a note (default: CLAWQL_MEMORY_RECALL_MIN_SCORE or 1)."
    ),
};

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
  });
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

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

/** Registers `memory_ingest` and `memory_recall` via `Plugin.onRegister`. */
export function createMemoryPlugin(): Plugin {
  return {
    id: MEMORY_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "memory_ingest",
          schema: memoryIngestToolSchema,
          handler: (args) => handleMemoryIngestToolInput(args as MemoryIngestInput),
        });
        yield* api.registerMcpTool({
          name: "memory_recall",
          schema: memoryRecallToolSchema,
          handler: (args) => handleMemoryRecallToolInput(args as MemoryRecallInput),
        });
      }),
  };
}
