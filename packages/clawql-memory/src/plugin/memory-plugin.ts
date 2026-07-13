import { Effect } from "effect";
import { z } from "zod";
import {
  codegraphExplain,
  codegraphIndex,
  codegraphNeighbors,
  codegraphPath,
  codegraphQuery,
  codegraphSubgraph,
} from "clawql-codegraph/mcp";
import {
  pageindexBuildTree,
  pageindexGetContent,
  pageindexSynthesize,
  pageindexTraverse,
} from "clawql-pageindex/mcp";
import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { runMemoryIngest, type MemoryIngestInput } from "../ingest/ingest.js";
import { runMemoryRecall, type MemoryRecallInput } from "../recall/recall.js";
import { codeGraphEnabled, defaultCodeGraphRoot } from "../recall/codegraph-recall.js";
import { pageIndexEnabled } from "../recall/pageindex-recall.js";

import type { Plugin } from "clawql-core";

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

export const pageindexBuildTreeToolSchema = {
  docId: z.string().min(1).describe("Stable document id for the PageIndex tree."),
  markdown: z.string().describe("Markdown source (heading hierarchy becomes the tree)."),
  storagePath: z.string().optional().describe("Optional JSON storage path override."),
};

export const pageindexTraverseToolSchema = {
  docId: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
};

export const pageindexSynthesizeToolSchema = {
  docId: z.string().min(1),
  query: z.string().min(1),
  tokenBudget: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
};

export const pageindexGetContentToolSchema = {
  docId: z.string().min(1),
  nodeId: z.string().min(1),
  storagePath: z.string().optional(),
};

export const codegraphIndexToolSchema = {
  rootPath: z
    .string()
    .optional()
    .describe("Repository root to index. Defaults to CLAWQL_CODEGRAPH_ROOT or process cwd."),
  graphId: z.string().optional().describe("Stable graph id (defaults from directory name)."),
  maxFiles: z.number().int().positive().optional().describe("Cap indexed source files."),
  storagePath: z.string().optional().describe("Optional JSON storage path override."),
};

export const codegraphQueryToolSchema = {
  graphId: z.string().min(1),
  query: z.string().min(1).describe("Symbol name, path fragment, or concept."),
  limit: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
};

export const codegraphNeighborsToolSchema = {
  graphId: z.string().min(1),
  nodeId: z.string().min(1).describe("Exact node id from codegraph_query."),
  edgeKinds: z
    .array(
      z.enum(["imports", "exports", "contains", "calls", "extends", "implements", "references"])
    )
    .optional(),
  limit: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
};

export const codegraphPathToolSchema = {
  graphId: z.string().min(1),
  from: z.string().min(1).describe("Start symbol or concept."),
  to: z.string().min(1).describe("End symbol or concept."),
  storagePath: z.string().optional(),
};

export const codegraphExplainToolSchema = {
  graphId: z.string().min(1),
  nodeQuery: z.string().min(1).describe("Symbol or concept to explain."),
  storagePath: z.string().optional(),
};

export const codegraphSubgraphToolSchema = {
  graphId: z.string().min(1),
  seedQuery: z.string().min(1),
  maxDepth: z.number().int().min(0).max(6).optional(),
  maxNodes: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
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

        if (pageIndexEnabled()) {
          yield* api.registerMcpTool({
            name: "pageindex_build_tree",
            schema: pageindexBuildTreeToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await pageindexBuildTree(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "pageindex_traverse",
            schema: pageindexTraverseToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await pageindexTraverse(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "pageindex_synthesize",
            schema: pageindexSynthesizeToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await pageindexSynthesize(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "pageindex_get_content",
            schema: pageindexGetContentToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await pageindexGetContent(args), null, 2) },
              ],
            }),
          });
        }

        if (codeGraphEnabled()) {
          yield* api.registerMcpTool({
            name: "codegraph_index",
            schema: codegraphIndexToolSchema,
            handler: async (args) => {
              const params = args as {
                rootPath?: string;
                graphId?: string;
                maxFiles?: number;
                storagePath?: string;
              };
              logMcpToolShape("codegraph_index", {
                rootPath: params.rootPath ?? defaultCodeGraphRoot(),
                graphId: params.graphId,
                maxFiles: params.maxFiles,
              });
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      await codegraphIndex({
                        ...params,
                        rootPath: params.rootPath ?? defaultCodeGraphRoot(),
                      }),
                      null,
                      2
                    ),
                  },
                ],
              };
            },
          });
          yield* api.registerMcpTool({
            name: "codegraph_query",
            schema: codegraphQueryToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await codegraphQuery(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "codegraph_neighbors",
            schema: codegraphNeighborsToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await codegraphNeighbors(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "codegraph_path",
            schema: codegraphPathToolSchema,
            handler: async (args) => ({
              content: [{ type: "text", text: JSON.stringify(await codegraphPath(args), null, 2) }],
            }),
          });
          yield* api.registerMcpTool({
            name: "codegraph_explain",
            schema: codegraphExplainToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await codegraphExplain(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "codegraph_subgraph",
            schema: codegraphSubgraphToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await codegraphSubgraph(args), null, 2) },
              ],
            }),
          });
        }
      }),
  };
}
