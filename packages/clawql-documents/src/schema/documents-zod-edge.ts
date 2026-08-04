/**
 * Thin Zod shapes for documents MCP SDK registration.
 * Domain validation: decode* in {@link ./documents-input-schema.js}.
 */

import { z } from "zod";
import {
  CLASSIFY_DOC_ID_DESCRIPTION,
  CLASSIFY_DOCLING_JSON_DESCRIPTION,
  CLASSIFY_DOCLING_MD_DESCRIPTION,
  CLASSIFY_MIN_CONFIDENCE_DESCRIPTION,
  CLASSIFY_TEXT_DESCRIPTION,
  EXTRACT_BACKEND_DESCRIPTION,
  EXTRACT_DOC_ID_DESCRIPTION,
  EXTRACT_EXAMPLES_DESCRIPTION,
  EXTRACT_MODEL_ID_DESCRIPTION,
  EXTRACT_PROMPT_DESCRIPTION,
  EXTRACT_SCHEMA_PRESET_DESCRIPTION,
  EXTRACT_TEXT_DESCRIPTION,
  EXTRACT_WRITE_HTML_DESCRIPTION,
  IDP_CORRELATION_ID_DESCRIPTION,
  IDP_DOCUMENT_PATH_DESCRIPTION,
  IDP_DOCUMENT_URL_DESCRIPTION,
  IDP_DRY_RUN_DESCRIPTION,
  IDP_FROM_STEP_DESCRIPTION,
  IDP_MAX_RETRIES_DESCRIPTION,
  IDP_PDF_BASE64_DESCRIPTION,
  IDP_PROCESSED_PATH_DESCRIPTION,
  IDP_REDACT_LIST_DESCRIPTION,
  IDP_SKIP_STAGES_DESCRIPTION,
  IDP_STEP_ARGS_DESCRIPTION,
  IDP_STOP_ON_ERROR_DESCRIPTION,
  IDP_TO_STEP_DESCRIPTION,
  INGEST_DOCUMENT_MARKDOWN_DESCRIPTION,
  INGEST_DOCUMENT_PATH_DESCRIPTION,
  INGEST_DOCUMENTS_DESCRIPTION,
  INGEST_DRY_RUN_DESCRIPTION,
  INGEST_SCOPE_DESCRIPTION,
  INGEST_SOURCE_DESCRIPTION,
  INGEST_URL_DESCRIPTION,
  INSPECT_PDF_BASE64_DESCRIPTION,
  INSPECT_PDF_INCLUDE_MARKDOWN_DESCRIPTION,
  INSPECT_PDF_MODE_DESCRIPTION,
  INSPECT_PDF_PATH_DESCRIPTION,
  CONVERT_DOCUMENT_BASE64_DESCRIPTION,
  CONVERT_DOCUMENT_FORMAT_DESCRIPTION,
  CONVERT_DOCUMENT_INCLUDE_MARKDOWN_DESCRIPTION,
  CONVERT_DOCUMENT_PATH_DESCRIPTION,
  ONYX_FIELDS_DESCRIPTION,
  ONYX_FILTERS_DESCRIPTION,
  ONYX_HYBRID_ALPHA_DESCRIPTION,
  ONYX_INCLUDE_CONTENT_DESCRIPTION,
  ONYX_NUM_HITS_DESCRIPTION,
  ONYX_QUERY_DESCRIPTION,
  ONYX_RUN_QUERY_EXPANSION_DESCRIPTION,
  ONYX_STREAM_DESCRIPTION,
  ONYX_TENANT_ID_DESCRIPTION,
} from "./documents-input-schema.js";

export const ingestExternalKnowledgeToolZodShape = {
  source: z.string().optional().describe(INGEST_SOURCE_DESCRIPTION),
  dryRun: z.boolean().optional().describe(INGEST_DRY_RUN_DESCRIPTION),
  scope: z.string().optional().describe(INGEST_SCOPE_DESCRIPTION),
  documents: z
    .array(
      z.object({
        path: z.string().min(1).max(512).describe(INGEST_DOCUMENT_PATH_DESCRIPTION),
        markdown: z.string().max(2_097_152).describe(INGEST_DOCUMENT_MARKDOWN_DESCRIPTION),
      })
    )
    .max(50)
    .optional()
    .describe(INGEST_DOCUMENTS_DESCRIPTION),
  url: z.string().max(2048).optional().describe(INGEST_URL_DESCRIPTION),
} as const;

export const knowledgeSearchOnyxToolZodShape = {
  query: z.string().min(1).describe(ONYX_QUERY_DESCRIPTION),
  num_hits: z.number().int().min(1).max(100).optional().describe(ONYX_NUM_HITS_DESCRIPTION),
  include_content: z.boolean().optional().describe(ONYX_INCLUDE_CONTENT_DESCRIPTION),
  stream: z.boolean().optional().describe(ONYX_STREAM_DESCRIPTION),
  run_query_expansion: z.boolean().optional().describe(ONYX_RUN_QUERY_EXPANSION_DESCRIPTION),
  hybrid_alpha: z.number().optional().describe(ONYX_HYBRID_ALPHA_DESCRIPTION),
  filters: z.record(z.string(), z.unknown()).optional().describe(ONYX_FILTERS_DESCRIPTION),
  tenant_id: z.string().optional().describe(ONYX_TENANT_ID_DESCRIPTION),
  fields: z.array(z.string()).optional().describe(ONYX_FIELDS_DESCRIPTION),
} as const;

const stageEnum = z.enum([
  "nextcloud",
  "docling",
  "tika",
  "gotenberg",
  "stirling",
  "paperless",
  "onyx",
  "coneshare",
]);

export const runIdpPipelineToolZodShape = {
  dry_run: z.boolean().optional().describe(IDP_DRY_RUN_DESCRIPTION),
  correlation_id: z.string().optional().describe(IDP_CORRELATION_ID_DESCRIPTION),
  document_path: z.string().optional().describe(IDP_DOCUMENT_PATH_DESCRIPTION),
  processed_path: z.string().optional().describe(IDP_PROCESSED_PATH_DESCRIPTION),
  document_url: z.string().optional().describe(IDP_DOCUMENT_URL_DESCRIPTION),
  redact_list: z.string().optional().describe(IDP_REDACT_LIST_DESCRIPTION),
  pdf_base64: z.string().optional().describe(IDP_PDF_BASE64_DESCRIPTION),
  step_args: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .describe(IDP_STEP_ARGS_DESCRIPTION),
  skip_stages: z.array(stageEnum).optional().describe(IDP_SKIP_STAGES_DESCRIPTION),
  stop_on_error: z.boolean().optional().describe(IDP_STOP_ON_ERROR_DESCRIPTION),
  max_retries: z.number().int().min(0).max(10).optional().describe(IDP_MAX_RETRIES_DESCRIPTION),
  from_step: z.number().int().min(0).optional().describe(IDP_FROM_STEP_DESCRIPTION),
  to_step: z.number().int().min(0).optional().describe(IDP_TO_STEP_DESCRIPTION),
} as const;

export const classifyDocumentToolZodShape = {
  doc_id: z.string().optional().describe(CLASSIFY_DOC_ID_DESCRIPTION),
  docling_md: z.string().optional().describe(CLASSIFY_DOCLING_MD_DESCRIPTION),
  docling_json: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(CLASSIFY_DOCLING_JSON_DESCRIPTION),
  text: z.string().optional().describe(CLASSIFY_TEXT_DESCRIPTION),
  min_confidence: z.number().min(0).max(1).optional().describe(CLASSIFY_MIN_CONFIDENCE_DESCRIPTION),
} as const;

const extractionExampleZod = z.object({
  extraction_class: z.string().min(1),
  extraction_text: z.string().min(1),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const exampleZod = z.object({
  text: z.string().min(1),
  extractions: z.array(extractionExampleZod).min(1),
});

export const extractDocumentToolZodShape = {
  text: z.string().min(1).max(2_097_152).describe(EXTRACT_TEXT_DESCRIPTION),
  prompt_description: z.string().min(1).max(8192).optional().describe(EXTRACT_PROMPT_DESCRIPTION),
  schema_preset: z
    .enum(["w2", "title_commitment", "purchase_agreement", "buyer_offer"])
    .optional()
    .describe(EXTRACT_SCHEMA_PRESET_DESCRIPTION),
  examples: z.array(exampleZod).max(20).optional().describe(EXTRACT_EXAMPLES_DESCRIPTION),
  model_id: z.string().optional().describe(EXTRACT_MODEL_ID_DESCRIPTION),
  backend: z
    .enum(["openrouter", "ollama", "openai_compatible"])
    .optional()
    .describe(EXTRACT_BACKEND_DESCRIPTION),
  write_html: z.boolean().optional().describe(EXTRACT_WRITE_HTML_DESCRIPTION),
  doc_id: z.string().optional().describe(EXTRACT_DOC_ID_DESCRIPTION),
} as const;

export const inspectPdfToolZodShape = {
  path: z.string().min(1).max(4096).optional().describe(INSPECT_PDF_PATH_DESCRIPTION),
  base64: z.string().min(1).max(140_000_000).optional().describe(INSPECT_PDF_BASE64_DESCRIPTION),
  mode: z.enum(["detect", "full"]).optional().describe(INSPECT_PDF_MODE_DESCRIPTION),
  include_markdown: z.boolean().optional().describe(INSPECT_PDF_INCLUDE_MARKDOWN_DESCRIPTION),
} as const;

export const convertDocumentToolZodShape = {
  path: z.string().min(1).max(4096).optional().describe(CONVERT_DOCUMENT_PATH_DESCRIPTION),
  base64: z
    .string()
    .min(1)
    .max(140_000_000)
    .optional()
    .describe(CONVERT_DOCUMENT_BASE64_DESCRIPTION),
  format: z.string().min(1).max(32).optional().describe(CONVERT_DOCUMENT_FORMAT_DESCRIPTION),
  include_markdown: z.boolean().optional().describe(CONVERT_DOCUMENT_INCLUDE_MARKDOWN_DESCRIPTION),
} as const;
