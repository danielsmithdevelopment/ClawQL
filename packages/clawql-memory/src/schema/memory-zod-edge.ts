/**
 * Thin Zod shapes for MCP SDK `memory_ingest` / `memory_recall` registration.
 * Domain validation: {@link decodeMemoryIngestInput} / {@link decodeMemoryRecallInput}.
 */

import { z } from "zod";
import {
  MEMORY_INGEST_APPEND_DESCRIPTION,
  MEMORY_INGEST_CONVERSATION_DESCRIPTION,
  MEMORY_INGEST_ENTERPRISE_CITATIONS_DESCRIPTION,
  MEMORY_INGEST_INSIGHTS_DESCRIPTION,
  MEMORY_INGEST_REBUILD_DESCRIPTION,
  MEMORY_INGEST_REBUILD_EMBEDDINGS_DESCRIPTION,
  MEMORY_INGEST_REBUILD_PAGEINDEX_DESCRIPTION,
  MEMORY_INGEST_SESSION_ID_DESCRIPTION,
  MEMORY_INGEST_TITLE_DESCRIPTION,
  MEMORY_INGEST_TOOL_OUTPUTS_DESCRIPTION,
  MEMORY_INGEST_TOOL_OUTPUTS_FILE_DESCRIPTION,
  MEMORY_INGEST_WIKILINKS_DESCRIPTION,
  MEMORY_RECALL_CODE_GRAPH_ID_DESCRIPTION,
  MEMORY_RECALL_INCLUDE_CODEGRAPH_DESCRIPTION,
  MEMORY_RECALL_LIMIT_DESCRIPTION,
  MEMORY_RECALL_MAX_DEPTH_DESCRIPTION,
  MEMORY_RECALL_MIN_SCORE_DESCRIPTION,
  MEMORY_RECALL_QUERY_DESCRIPTION,
  MEMORY_RECALL_SOURCES_DESCRIPTION,
} from "./memory-input-schema.js";

const memoryEnterpriseCitationZod = z.object({
  title: z.string().max(500).optional(),
  url: z.string().max(2048).optional(),
  document_id: z.string().max(200).optional(),
  source: z.string().max(200).optional(),
  snippet: z.string().max(400).optional(),
});

/** Zod raw shape for MCP `memory_ingest` — mirrors {@link MemoryIngestInputSchema}. */
export const memoryIngestToolZodShape = {
  title: z.string().min(1).describe(MEMORY_INGEST_TITLE_DESCRIPTION),
  insights: z.string().optional().describe(MEMORY_INGEST_INSIGHTS_DESCRIPTION),
  conversation: z.string().optional().describe(MEMORY_INGEST_CONVERSATION_DESCRIPTION),
  toolOutputs: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(MEMORY_INGEST_TOOL_OUTPUTS_DESCRIPTION),
  toolOutputsFile: z.string().optional().describe(MEMORY_INGEST_TOOL_OUTPUTS_FILE_DESCRIPTION),
  enterpriseCitations: z
    .array(memoryEnterpriseCitationZod)
    .max(30)
    .optional()
    .describe(MEMORY_INGEST_ENTERPRISE_CITATIONS_DESCRIPTION),
  wikilinks: z.array(z.string()).optional().describe(MEMORY_INGEST_WIKILINKS_DESCRIPTION),
  sessionId: z.string().optional().describe(MEMORY_INGEST_SESSION_ID_DESCRIPTION),
  append: z.boolean().optional().describe(MEMORY_INGEST_APPEND_DESCRIPTION),
  rebuild: z
    .object({
      pageindex: z.boolean().optional().describe(MEMORY_INGEST_REBUILD_PAGEINDEX_DESCRIPTION),
      embeddings: z.boolean().optional().describe(MEMORY_INGEST_REBUILD_EMBEDDINGS_DESCRIPTION),
    })
    .optional()
    .describe(MEMORY_INGEST_REBUILD_DESCRIPTION),
} as const;

/** Zod raw shape for MCP `memory_recall` — mirrors {@link MemoryRecallInputSchema}. */
export const memoryRecallToolZodShape = {
  query: z.string().min(1).describe(MEMORY_RECALL_QUERY_DESCRIPTION),
  limit: z.number().int().min(1).max(50).optional().describe(MEMORY_RECALL_LIMIT_DESCRIPTION),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe(MEMORY_RECALL_MAX_DEPTH_DESCRIPTION),
  minScore: z.number().min(0).optional().describe(MEMORY_RECALL_MIN_SCORE_DESCRIPTION),
  includeCodeGraph: z.boolean().optional().describe(MEMORY_RECALL_INCLUDE_CODEGRAPH_DESCRIPTION),
  codeGraphId: z.string().optional().describe(MEMORY_RECALL_CODE_GRAPH_ID_DESCRIPTION),
  sources: z
    .array(z.enum(["vault", "vector", "codegraph", "pageindex", "onyx"]))
    .min(1)
    .optional()
    .describe(MEMORY_RECALL_SOURCES_DESCRIPTION),
} as const;
