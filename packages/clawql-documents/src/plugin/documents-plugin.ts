import {
  handleRunIdpPipelineToolInput,
  runIdpPipelineToolSchema,
} from "../pipeline/run-idp-pipeline.js";
import type { RunIdpPipelineInput } from "../pipeline/runner.js";
import { runIngestExternalKnowledge, type ExternalIngestInput } from "../ingest/external-ingest.js";
import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import type { Plugin } from "clawql-core";
import { Effect } from "effect";
import { z } from "zod";
import {
  handleKnowledgeSearchOnyxToolInput,
  type KnowledgeSearchOnyxInput,
} from "./knowledge-search-onyx.js";

export const DOCUMENTS_PLUGIN_ID = "clawql-documents";

export const ingestExternalKnowledgeToolSchema = {
  source: z
    .string()
    .optional()
    .describe(
      'Importer: "markdown" (default when documents[] is set) or "url" for HTTPS fetch (requires CLAWQL_EXTERNAL_INGEST_FETCH=1). Omit payload for roadmap preview.'
    ),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "Default true: validate only. Set false to write Markdown or (url mode) fetch and write."
    ),
  scope: z
    .string()
    .optional()
    .describe(
      "Optional vault-relative .md path for url imports (default: Memory/external/<slug>.md)."
    ),
  documents: z
    .array(
      z.object({
        path: z.string().min(1).max(512).describe("Vault-relative path; must end with .md"),
        markdown: z.string().max(2_097_152).describe("Markdown body UTF-8 (max ~2 MiB per file)."),
      })
    )
    .max(50)
    .optional()
    .describe("Bulk Markdown files to import when CLAWQL_EXTERNAL_INGEST=1."),
  url: z
    .string()
    .max(2048)
    .optional()
    .describe(
      "HTTPS URL to fetch when source is url and CLAWQL_EXTERNAL_INGEST_FETCH=1 (opt-in network)."
    ),
};

export const knowledgeSearchOnyxToolSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      "Natural language or keyword query against the Onyx index (maps to `search_query` on the Onyx API)."
    ),
  num_hits: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max hits to return (default 15)."),
  include_content: z
    .boolean()
    .optional()
    .describe("Include chunk/content in results when supported (default true)."),
  stream: z
    .boolean()
    .optional()
    .describe("Must be false or omitted; streaming is not supported for this tool."),
  run_query_expansion: z
    .boolean()
    .optional()
    .describe("Whether to run query expansion on the Onyx side (default false)."),
  hybrid_alpha: z.number().optional().describe("Optional hybrid search alpha (Onyx-specific)."),
  filters: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional Onyx index filters object."),
  tenant_id: z.string().optional().describe("Optional multi-tenant id (query parameter)."),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Optional top-level JSON keys to keep from the Onyx response (same as execute `fields`)."
    ),
};

export async function handleIngestExternalKnowledgeToolInput(
  params: ExternalIngestInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("ingest_external_knowledge", {
    sourceChars: params.source?.length ?? 0,
    dryRun: params.dryRun !== false,
    hasScope: Boolean(params.scope?.trim()),
    documentCount: params.documents?.length ?? 0,
    urlChars: params.url?.length ?? 0,
  });
  const result = await runIngestExternalKnowledge(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export type CreateDocumentsPluginOptions = {
  /** Register `knowledge_search_onyx` when `CLAWQL_ENABLE_ONYX=1` (requires documents tier). */
  readonly enableOnyx?: boolean;
  /** Register `run_idp_pipeline` when `CLAWQL_ENABLE_IDP_PIPELINE=1` ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)). */
  readonly enableIdpPipeline?: boolean;
};

export function createDocumentsPlugin(options: CreateDocumentsPluginOptions = {}): Plugin {
  const enableOnyx = options.enableOnyx ?? false;
  const enableIdpPipeline = options.enableIdpPipeline ?? false;
  return {
    id: DOCUMENTS_PLUGIN_ID,
    version: "0.1.0",
    kind: "default",
    onRegister: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "ingest_external_knowledge",
          schema: ingestExternalKnowledgeToolSchema,
          handler: (args) => handleIngestExternalKnowledgeToolInput(args as ExternalIngestInput),
        });
        if (enableOnyx) {
          yield* api.registerMcpTool({
            name: "knowledge_search_onyx",
            schema: knowledgeSearchOnyxToolSchema,
            handler: (args) => handleKnowledgeSearchOnyxToolInput(args as KnowledgeSearchOnyxInput),
          });
        }
        if (enableIdpPipeline) {
          yield* api.registerMcpTool({
            name: "run_idp_pipeline",
            schema: runIdpPipelineToolSchema,
            handler: (args) => handleRunIdpPipelineToolInput(args as RunIdpPipelineInput),
          });
        }
      }),
  };
}
