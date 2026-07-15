/**
 * Authoritative Effect Schema for MCP `memory_ingest` / `memory_recall` inputs.
 *
 * MCP SDK (@modelcontextprotocol/sdk@1.29) still requires Zod at registration —
 * see {@link ./memory-zod-edge.js}. Decode unknown payloads with these schemas
 * inside Effect pipelines; do not treat Zod as the domain validator.
 */

import { Effect, ParseResult, Schema } from "effect";
import type { MemoryIngestInput } from "../ingest/ingest.js";
import type { MemoryRecallInput } from "../recall/recall.js";
import { MEMORY_RECALL_SOURCES } from "../recall/recall-sources.js";

// --- Shared descriptions (single source for Schema annotations + Zod edge) ---

export const MEMORY_INGEST_TITLE_DESCRIPTION =
  "Suggested Obsidian page title (used for the file name and heading).";
export const MEMORY_INGEST_INSIGHTS_DESCRIPTION = "Key insights to persist.";
export const MEMORY_INGEST_CONVERSATION_DESCRIPTION = "Conversation transcript or summary text.";
export const MEMORY_INGEST_TOOL_OUTPUTS_DESCRIPTION =
  "Tool result body, or a list of results to record.";
export const MEMORY_INGEST_TOOL_OUTPUTS_FILE_DESCRIPTION =
  "If set, the ClawQL server reads UTF-8 from this file path and uses it as `toolOutputs` (small MCP payload; " +
  "large content does not go through the tool round-trip). File must be under an allowed root " +
  "(`CLAWQL_MEMORY_INGEST_FILE_ROOTS` or, by default, the process current working directory). " +
  "Takes precedence over `toolOutputs` if both are set. Set `CLAWQL_MEMORY_INGEST_FILE=0` to reject.";
export const MEMORY_INGEST_ENTERPRISE_CITATIONS_DESCRIPTION =
  "Optional short citation rows (e.g. trimmed from Onyx `knowledge_search_onyx` JSON). " +
  "Stored as a small Markdown block in the vault — not full retrieval payloads (#130).";
export const MEMORY_INGEST_WIKILINKS_DESCRIPTION =
  "Other vault page names to link with Obsidian [[wikilinks]] (plain names; brackets optional).";
export const MEMORY_INGEST_SESSION_ID_DESCRIPTION = "Optional session label (shown in the note).";
export const MEMORY_INGEST_APPEND_DESCRIPTION =
  "When the page already exists, append a new section (default true). Set false to replace the file.";
export const MEMORY_INGEST_REBUILD_DESCRIPTION =
  "Derived-index rebuilds after the canonical vault Markdown write.";
export const MEMORY_INGEST_REBUILD_PAGEINDEX_DESCRIPTION =
  "Rebuild PageIndex tree for the written vault note (or set CLAWQL_MEMORY_INGEST_REBUILD_PAGEINDEX=1).";
export const MEMORY_INGEST_REBUILD_EMBEDDINGS_DESCRIPTION =
  "Ensure memory.db chunk/embedding sync after write (default on when memory.db enabled). Set false to skip.";

export const MEMORY_RECALL_QUERY_DESCRIPTION =
  "Natural language or keywords to find in vault Markdown (filename + body + headings).";
export const MEMORY_RECALL_LIMIT_DESCRIPTION =
  "Max notes to return (default: CLAWQL_MEMORY_RECALL_LIMIT or 10).";
export const MEMORY_RECALL_MAX_DEPTH_DESCRIPTION =
  "How many wikilink hops to follow from keyword hits (default: CLAWQL_MEMORY_RECALL_MAX_DEPTH or 2).";
export const MEMORY_RECALL_MIN_SCORE_DESCRIPTION =
  "Minimum keyword match score to seed a note (default: CLAWQL_MEMORY_RECALL_MIN_SCORE or 1).";
export const MEMORY_RECALL_INCLUDE_CODEGRAPH_DESCRIPTION =
  "When true, include codegraph source even if CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH is unset (same as sources including codegraph).";
export const MEMORY_RECALL_CODE_GRAPH_ID_DESCRIPTION =
  "Code graph id for hybrid supplement (default from CLAWQL_CODEGRAPH_ID).";
export const MEMORY_RECALL_SOURCES_DESCRIPTION =
  "Which recall backends to query. Omit for defaults: vault+vector, plus hybrids from env " +
  "(CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH / _PAGEINDEX / _ONYX) or includeCodeGraph. " +
  "Returns normalized hits[] + followUps for specialist tools.";

const EnterpriseCitationSchema = Schema.Struct({
  title: Schema.optional(Schema.String.pipe(Schema.maxLength(500))),
  url: Schema.optional(Schema.String.pipe(Schema.maxLength(2048))),
  document_id: Schema.optional(Schema.String.pipe(Schema.maxLength(200))),
  source: Schema.optional(Schema.String.pipe(Schema.maxLength(200))),
  snippet: Schema.optional(Schema.String.pipe(Schema.maxLength(400))),
});

const MemoryRebuildSchema = Schema.Struct({
  pageindex: Schema.optional(
    Schema.Boolean.annotations({ description: MEMORY_INGEST_REBUILD_PAGEINDEX_DESCRIPTION })
  ),
  embeddings: Schema.optional(
    Schema.Boolean.annotations({ description: MEMORY_INGEST_REBUILD_EMBEDDINGS_DESCRIPTION })
  ),
}).annotations({ description: MEMORY_INGEST_REBUILD_DESCRIPTION });

const MemoryRecallSourceSchema = Schema.Literal(...MEMORY_RECALL_SOURCES);

/** MCP `memory_ingest` tool arguments — Effect Schema (source of truth). */
export const MemoryIngestInputSchema = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: MEMORY_INGEST_TITLE_DESCRIPTION,
  }),
  insights: Schema.optional(
    Schema.String.annotations({ description: MEMORY_INGEST_INSIGHTS_DESCRIPTION })
  ),
  conversation: Schema.optional(
    Schema.String.annotations({ description: MEMORY_INGEST_CONVERSATION_DESCRIPTION })
  ),
  toolOutputs: Schema.optional(
    Schema.Union(Schema.String, Schema.mutable(Schema.Array(Schema.String))).annotations({
      description: MEMORY_INGEST_TOOL_OUTPUTS_DESCRIPTION,
    })
  ),
  toolOutputsFile: Schema.optional(
    Schema.String.annotations({ description: MEMORY_INGEST_TOOL_OUTPUTS_FILE_DESCRIPTION })
  ),
  enterpriseCitations: Schema.optional(
    Schema.mutable(Schema.Array(EnterpriseCitationSchema))
      .pipe(Schema.maxItems(30))
      .annotations({ description: MEMORY_INGEST_ENTERPRISE_CITATIONS_DESCRIPTION })
  ),
  wikilinks: Schema.optional(
    Schema.mutable(Schema.Array(Schema.String)).annotations({
      description: MEMORY_INGEST_WIKILINKS_DESCRIPTION,
    })
  ),
  sessionId: Schema.optional(
    Schema.String.annotations({ description: MEMORY_INGEST_SESSION_ID_DESCRIPTION })
  ),
  append: Schema.optional(
    Schema.Boolean.annotations({ description: MEMORY_INGEST_APPEND_DESCRIPTION })
  ),
  rebuild: Schema.optional(MemoryRebuildSchema),
});

export type MemoryIngestInputDecoded = Schema.Schema.Type<typeof MemoryIngestInputSchema>;

const _ingestAssignability: MemoryIngestInputDecoded extends MemoryIngestInput ? true : false =
  true;
void _ingestAssignability;

/** MCP `memory_recall` tool arguments — Effect Schema (source of truth). */
export const MemoryRecallInputSchema = Schema.Struct({
  query: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: MEMORY_RECALL_QUERY_DESCRIPTION,
  }),
  limit: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(1, 50)).annotations({
      description: MEMORY_RECALL_LIMIT_DESCRIPTION,
    })
  ),
  maxDepth: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(0, 10)).annotations({
      description: MEMORY_RECALL_MAX_DEPTH_DESCRIPTION,
    })
  ),
  minScore: Schema.optional(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(0)).annotations({
      description: MEMORY_RECALL_MIN_SCORE_DESCRIPTION,
    })
  ),
  includeCodeGraph: Schema.optional(
    Schema.Boolean.annotations({ description: MEMORY_RECALL_INCLUDE_CODEGRAPH_DESCRIPTION })
  ),
  codeGraphId: Schema.optional(
    Schema.String.annotations({ description: MEMORY_RECALL_CODE_GRAPH_ID_DESCRIPTION })
  ),
  sources: Schema.optional(
    Schema.mutable(Schema.Array(MemoryRecallSourceSchema))
      .pipe(Schema.minItems(1))
      .annotations({ description: MEMORY_RECALL_SOURCES_DESCRIPTION })
  ),
});

export type MemoryRecallInputDecoded = Schema.Schema.Type<typeof MemoryRecallInputSchema>;

const _recallAssignability: MemoryRecallInputDecoded extends MemoryRecallInput ? true : false =
  true;
void _recallAssignability;

function formatParseError(err: ParseResult.ParseError): Error {
  return new Error(ParseResult.TreeFormatter.formatErrorSync(err));
}

/** Decode unknown MCP memory_ingest args into {@link MemoryIngestInputDecoded}. */
export function decodeMemoryIngestInput(
  raw: unknown
): Effect.Effect<MemoryIngestInputDecoded, Error> {
  return Schema.decodeUnknown(MemoryIngestInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}

/** Decode unknown MCP memory_recall args into {@link MemoryRecallInputDecoded}. */
export function decodeMemoryRecallInput(
  raw: unknown
): Effect.Effect<MemoryRecallInputDecoded, Error> {
  return Schema.decodeUnknown(MemoryRecallInputSchema)(raw).pipe(Effect.mapError(formatParseError));
}
