/**
 * Thin Zod shapes for MCP SDK `memory_ingest` / `memory_recall` registration.
 * Domain validation: {@link decodeMemoryIngestInput} / {@link decodeMemoryRecallInput}.
 */

import { z } from "zod";
import {
  MEMORY_INGEST_AGENT_ID_DESCRIPTION,
  MEMORY_INGEST_APPEND_DESCRIPTION,
  MEMORY_INGEST_CONVERSATION_DESCRIPTION,
  MEMORY_INGEST_CORRELATION_ID_DESCRIPTION,
  MEMORY_INGEST_DESCRIPTION_DESCRIPTION,
  MEMORY_INGEST_ENTERPRISE_CITATIONS_DESCRIPTION,
  MEMORY_INGEST_INSIGHTS_DESCRIPTION,
  MEMORY_INGEST_REBUILD_DESCRIPTION,
  MEMORY_INGEST_REBUILD_EMBEDDINGS_DESCRIPTION,
  MEMORY_INGEST_REBUILD_PAGEINDEX_DESCRIPTION,
  MEMORY_INGEST_RESOURCE_DESCRIPTION,
  MEMORY_INGEST_SESSION_ID_DESCRIPTION,
  MEMORY_INGEST_TAGS_DESCRIPTION,
  MEMORY_INGEST_TITLE_DESCRIPTION,
  MEMORY_INGEST_TOOL_OUTPUTS_DESCRIPTION,
  MEMORY_INGEST_TOOL_OUTPUTS_FILE_DESCRIPTION,
  MEMORY_INGEST_TYPE_DESCRIPTION,
  MEMORY_INGEST_VERDICT_DESCRIPTION,
  MEMORY_INGEST_CONFIDENCE_SCORE_DESCRIPTION,
  MEMORY_INGEST_STALE_AFTER_DESCRIPTION,
  MEMORY_INGEST_STATUS_DESCRIPTION,
  MEMORY_INGEST_SUPERSEDED_BY_DESCRIPTION,
  MEMORY_INGEST_MODEL_DESCRIPTION,
  MEMORY_INGEST_VERIFIED_DESCRIPTION,
  MEMORY_INGEST_SOURCES_DESCRIPTION,
  MEMORY_INGEST_WIKILINKS_DESCRIPTION,
  MEMORY_INGEST_WORM_REF_DESCRIPTION,
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
  type: z.string().min(1).optional().describe(MEMORY_INGEST_TYPE_DESCRIPTION),
  description: z.string().optional().describe(MEMORY_INGEST_DESCRIPTION_DESCRIPTION),
  resource: z.string().nullable().optional().describe(MEMORY_INGEST_RESOURCE_DESCRIPTION),
  tags: z.array(z.string()).optional().describe(MEMORY_INGEST_TAGS_DESCRIPTION),
  correlationId: z.string().optional().describe(MEMORY_INGEST_CORRELATION_ID_DESCRIPTION),
  wormRef: z.string().nullable().optional().describe(MEMORY_INGEST_WORM_REF_DESCRIPTION),
  agentId: z.string().optional().describe(MEMORY_INGEST_AGENT_ID_DESCRIPTION),
  verdict: z.string().optional().describe(MEMORY_INGEST_VERDICT_DESCRIPTION),
  confidenceScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(MEMORY_INGEST_CONFIDENCE_SCORE_DESCRIPTION),
  staleAfter: z.string().optional().describe(MEMORY_INGEST_STALE_AFTER_DESCRIPTION),
  status: z
    .enum(["current", "stale", "superseded", "retracted"])
    .optional()
    .describe(MEMORY_INGEST_STATUS_DESCRIPTION),
  supersededBy: z.string().nullable().optional().describe(MEMORY_INGEST_SUPERSEDED_BY_DESCRIPTION),
  model: z.string().optional().describe(MEMORY_INGEST_MODEL_DESCRIPTION),
  verified: z
    .object({
      by: z.string().optional(),
      at: z.string().optional(),
      method: z.string().optional(),
      reviewer: z.string().optional(),
    })
    .optional()
    .describe(MEMORY_INGEST_VERIFIED_DESCRIPTION),
  sources: z
    .array(z.record(z.string(), z.union([z.string(), z.number()])))
    .optional()
    .describe(MEMORY_INGEST_SOURCES_DESCRIPTION),
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
