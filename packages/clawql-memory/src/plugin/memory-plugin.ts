import { Effect } from "effect";
import { z } from "zod";
import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { runMemoryIngest } from "../ingest/ingest.js";
import { runMemoryRecall } from "../recall/recall.js";
import { executeReadAroundEffect, type ReadAroundInput } from "../recall/read-around.js";
import {
  decodeMemoryIngestInput,
  decodeMemoryRecallInput,
  memoryIngestToolZodShape,
  memoryRecallToolZodShape,
} from "../schema/index.js";
import { VaultConfigService } from "../effect/vault-config-service.js";
import { memoryServicesLiveLayer } from "../effect/memory-effect-runtime.js";

import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";

export const MEMORY_PLUGIN_ID = "clawql-memory";

/** @deprecated Prefer {@link memoryIngestToolZodShape} — MCP SDK listing only. */
export const memoryIngestToolSchema = memoryIngestToolZodShape;
/** @deprecated Prefer {@link memoryRecallToolZodShape} — MCP SDK listing only. */
export const memoryRecallToolSchema = memoryRecallToolZodShape;

export const readAroundToolSchema = {
  path: z.string().optional().describe("Vault-relative Markdown path (e.g. Memory/handbook.md)."),
  markdown: z.string().optional().describe("Inline Markdown when path is omitted (eval harness)."),
  sectionId: z
    .string()
    .optional()
    .describe("Shared section id from Docling/heading map (e.g. sec-protocols)."),
  chunkText: z
    .string()
    .optional()
    .describe("Snippet from a recall hit; returns the enclosing heading section."),
  tokenBudget: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Approx token budget for returned content (default 1200)."),
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
    schema: parsed.schema,
    filterKeys: parsed.filters ? Object.keys(parsed.filters) : undefined,
    confidenceMinimum: parsed.confidenceMinimum,
  });
  const result = await runMemoryRecall(parsed);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export async function handleReadAroundToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const input = params as ReadAroundInput;
  logMcpToolShape("read_around", {
    path: input.path,
    hasMarkdown: Boolean(input.markdown),
    sectionId: input.sectionId,
    chunkChars: input.chunkText?.length,
    tokenBudget: input.tokenBudget,
  });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const cfg = yield* VaultConfigService;
      const vault = cfg.getObsidianVaultPath() ?? undefined;
      return yield* executeReadAroundEffect(vault, input);
    }).pipe(Effect.provide(memoryServicesLiveLayer()))
  );
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

/** Registers `memory_ingest`, `memory_recall`, and `read_around` MCP tools. */
export function createMemoryPlugin(): ProviderPlugin {
  return defineRegisteringProviderPlugin({
    id: MEMORY_PLUGIN_ID,
    version: "0.1.0",
    description: "ClawQL memory vault ingest/recall tools",
    register: (api) =>
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
        yield* api.registerMcpTool({
          name: "read_around",
          schema: readAroundToolSchema,
          handler: (args) => handleReadAroundToolInput(args),
        });
      }),
  });
}

/** Alias for {@link createMemoryPlugin}. */
export const createMemoryProviderPlugin = createMemoryPlugin;
