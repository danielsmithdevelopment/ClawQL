import { Effect } from "effect";
import { z } from "zod";
import {
  codegraphExplain,
  codegraphExplore,
  codegraphImpact,
  codegraphImportGraphify,
  codegraphIndex,
  codegraphNeighbors,
  codegraphPath,
  codegraphQuery,
  codegraphSubgraph,
  codegraphSync,
  codegraphSyncGraphify,
} from "clawql-codegraph/mcp";
import {
  executePageindexBuildTreeEffect,
  executePageindexGetContentEffect,
  executePageindexSynthesizeEffect,
  executePageindexTraverseEffect,
} from "../effect/pageindex-effect.js";
import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { runMemoryIngest } from "../ingest/ingest.js";
import { runMemoryRecall } from "../recall/recall.js";
import { codeGraphEnabled, defaultCodeGraphRoot } from "../recall/codegraph-recall.js";
import { pageIndexEnabled } from "../recall/pageindex-enabled.js";
import {
  decodeMemoryIngestInput,
  decodeMemoryRecallInput,
  memoryIngestToolZodShape,
  memoryRecallToolZodShape,
} from "../schema/index.js";

import type { Plugin } from "clawql-core";

export const MEMORY_PLUGIN_ID = "clawql-memory";

/** @deprecated Prefer {@link memoryIngestToolZodShape} — MCP SDK listing only. */
export const memoryIngestToolSchema = memoryIngestToolZodShape;
/** @deprecated Prefer {@link memoryRecallToolZodShape} — MCP SDK listing only. */
export const memoryRecallToolSchema = memoryRecallToolZodShape;

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

export const codegraphExploreToolSchema = {
  graphId: z.string().min(1),
  query: z
    .string()
    .min(1)
    .describe("Symbol or path — one-shot explain + neighbors + blast radius for agent efficiency."),
  impactDepth: z.number().int().min(1).max(6).optional(),
  neighborLimit: z.number().int().positive().optional(),
  subgraphDepth: z.number().int().min(0).max(6).optional(),
  storagePath: z.string().optional(),
};

export const codegraphImpactToolSchema = {
  graphId: z.string().min(1),
  seedQuery: z.string().min(1).describe("Symbol whose upstream dependents to list."),
  depth: z.number().int().min(1).max(8).optional(),
  limit: z.number().int().positive().optional(),
  storagePath: z.string().optional(),
};

export const codegraphImportGraphifyToolSchema = {
  jsonPath: z.string().min(1).describe("Path to Graphify graph.json export."),
  graphId: z.string().optional(),
  rootPath: z.string().optional(),
  storagePath: z.string().optional(),
};

export const codegraphSyncToolSchema = {
  rootPath: z
    .string()
    .optional()
    .describe("Repository root. Defaults to CLAWQL_CODEGRAPH_ROOT or process cwd."),
  graphId: z.string().optional(),
  storagePath: z.string().optional(),
  mode: z
    .enum(["fast", "thorough"])
    .optional()
    .describe("thorough raises the default maxFiles cap for larger repos."),
  outDir: z.string().optional().describe("Artifact directory (default: {root}/codegraph-out)."),
  vaultIngest: z
    .boolean()
    .optional()
    .describe("Auto-ingest architecture report into the vault (default true)."),
  maxFiles: z.number().int().positive().optional(),
  writeHtml: z.boolean().optional(),
};

export const codegraphSyncGraphifyToolSchema = {
  rootPath: z
    .string()
    .optional()
    .describe("Repository root. Defaults to CLAWQL_CODEGRAPH_ROOT or process cwd."),
  graphId: z.string().optional(),
  storagePath: z.string().optional(),
  mode: z.enum(["fast", "thorough"]).optional(),
  skipGraphifyRun: z
    .boolean()
    .optional()
    .describe("Ignored (Python Graphify CLI is never spawned). Kept for back-compat."),
  outDir: z
    .string()
    .optional()
    .describe("Existing graph.json directory to import; falls back to native codegraph_sync."),
  vaultIngest: z
    .boolean()
    .optional()
    .describe("Auto-ingest architecture report into the vault (default true)."),
  maxFiles: z.number().int().positive().optional(),
};

export async function handleMemoryIngestToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeMemoryIngestInput(params));
  const result = await runMemoryIngest(parsed);
  logMcpToolShape("memory_ingest", {
    titleChars: parsed.title?.length ?? 0,
    append: parsed.append,
    hasInsights: Boolean(parsed.insights?.trim()),
    enterpriseCitationCount: parsed.enterpriseCitations?.length ?? 0,
    hasConversation: Boolean(parsed.conversation?.trim()),
    hasToolOutputsFile: Boolean(parsed.toolOutputsFile?.trim()),
    hasToolOutputs: Boolean(
      typeof parsed.toolOutputs === "string"
        ? parsed.toolOutputs.trim()
        : parsed.toolOutputs?.some((s) => s.trim())
    ),
    wikilinkCount: parsed.wikilinks?.length ?? 0,
    hasSessionId: Boolean(parsed.sessionId?.trim()),
    rebuildPageindex: parsed.rebuild?.pageindex,
    rebuildEmbeddings: parsed.rebuild?.embeddings,
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
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeMemoryRecallInput(params));
  logMcpToolShape("memory_recall", {
    queryChars: parsed.query?.length ?? 0,
    limit: parsed.limit,
    maxDepth: parsed.maxDepth,
    minScore: parsed.minScore,
    sources: parsed.sources,
    includeCodeGraph: parsed.includeCodeGraph,
  });
  const result = await runMemoryRecall(parsed);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

async function applyVaultIngestProposal(syncResult: {
  vaultIngest?: {
    title: string;
    type: string;
    description: string;
    insights: string;
    wikilinks: readonly string[];
    tags: readonly string[];
    toolOutputs: string;
  };
}): Promise<unknown> {
  if (!syncResult.vaultIngest) return undefined;
  const proposal = syncResult.vaultIngest;
  return runMemoryIngest({
    title: proposal.title,
    type: proposal.type,
    description: proposal.description,
    insights: proposal.insights,
    wikilinks: [...proposal.wikilinks],
    append: true,
    tags: [...proposal.tags],
    toolOutputs: proposal.toolOutputs,
  });
}

async function handleCodegraphSync(args: unknown): Promise<{
  content: { type: "text"; text: string }[];
}> {
  const syncResult = await codegraphSync(args);
  const vaultIngestResult = await applyVaultIngestProposal(syncResult);
  logMcpToolShape("codegraph_sync", {
    mode: syncResult.mode,
    engine: syncResult.engine,
    nodeCount: syncResult.summary.nodeCount,
    edgeCount: syncResult.summary.edgeCount,
    communityCount: syncResult.communities.length,
    modularity: syncResult.modularity,
    vaultIngested: Boolean(syncResult.vaultIngest),
  });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...syncResult, vaultIngestResult }, null, 2),
      },
    ],
  };
}

async function handleCodegraphImpact(args: unknown): Promise<{
  content: { type: "text"; text: string }[];
}> {
  const impact = await codegraphImpact(args);
  let vaultIngestResult: unknown;
  const { codeChangeVaultFlywheelEnabled, buildCodeChangeIngestProposal } =
    await import("../recall/codegraph-code-change.js");
  if (codeChangeVaultFlywheelEnabled()) {
    const proposal = buildCodeChangeIngestProposal(
      impact as Parameters<typeof buildCodeChangeIngestProposal>[0]
    );
    if (proposal) {
      vaultIngestResult = await runMemoryIngest(proposal);
    }
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...impact, vaultIngestResult }, null, 2),
      },
    ],
  };
}

async function handleCodegraphSyncGraphify(args: unknown): Promise<{
  content: { type: "text"; text: string }[];
}> {
  const syncResult = await codegraphSyncGraphify(args);
  const vaultIngestResult = await applyVaultIngestProposal(syncResult);
  logMcpToolShape("codegraph_sync_graphify", {
    mode: syncResult.mode,
    graphifyRan: syncResult.graphifyRan,
    nativeIndexRan: syncResult.nativeIndexRan,
    fellBackToNative: syncResult.fellBackToNative,
    nodeCount: syncResult.importSummary.nodeCount,
    edgeCount: syncResult.importSummary.edgeCount,
    blindSpotCount: syncResult.blindSpots.blindSpots.length,
    communityCount: syncResult.communities.length,
    vaultIngested: Boolean(syncResult.vaultIngest),
  });
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...syncResult, vaultIngestResult }, null, 2),
      },
    ],
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
          schema: memoryIngestToolZodShape,
          handler: (args) => handleMemoryIngestToolInput(args),
        });
        yield* api.registerMcpTool({
          name: "memory_recall",
          schema: memoryRecallToolZodShape,
          handler: (args) => handleMemoryRecallToolInput(args),
        });

        if (pageIndexEnabled()) {
          yield* api.registerMcpTool({
            name: "pageindex_build_tree",
            schema: pageindexBuildTreeToolSchema,
            handler: (args) => Effect.runPromise(executePageindexBuildTreeEffect(args)),
          });
          yield* api.registerMcpTool({
            name: "pageindex_traverse",
            schema: pageindexTraverseToolSchema,
            handler: (args) => Effect.runPromise(executePageindexTraverseEffect(args)),
          });
          yield* api.registerMcpTool({
            name: "pageindex_synthesize",
            schema: pageindexSynthesizeToolSchema,
            handler: (args) => Effect.runPromise(executePageindexSynthesizeEffect(args)),
          });
          yield* api.registerMcpTool({
            name: "pageindex_get_content",
            schema: pageindexGetContentToolSchema,
            handler: (args) => Effect.runPromise(executePageindexGetContentEffect(args)),
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
          yield* api.registerMcpTool({
            name: "codegraph_explore",
            schema: codegraphExploreToolSchema,
            handler: async (args) => ({
              content: [
                { type: "text", text: JSON.stringify(await codegraphExplore(args), null, 2) },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "codegraph_impact",
            schema: codegraphImpactToolSchema,
            handler: (args) => handleCodegraphImpact(args),
          });
          yield* api.registerMcpTool({
            name: "codegraph_import_graphify",
            schema: codegraphImportGraphifyToolSchema,
            handler: async (args) => ({
              content: [
                {
                  type: "text",
                  text: JSON.stringify(await codegraphImportGraphify(args), null, 2),
                },
              ],
            }),
          });
          yield* api.registerMcpTool({
            name: "codegraph_sync",
            schema: codegraphSyncToolSchema,
            handler: (args) => handleCodegraphSync(args),
          });
          yield* api.registerMcpTool({
            name: "codegraph_sync_graphify",
            schema: codegraphSyncGraphifyToolSchema,
            handler: (args) => handleCodegraphSyncGraphify(args),
          });
        }
      }),
  };
}
