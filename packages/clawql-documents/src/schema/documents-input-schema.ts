/**
 * Authoritative Effect Schema for documents MCP tool inputs.
 * Thin Zod edges: {@link ./documents-zod-edge.js}.
 */

import { Effect, ParseResult, Schema } from "effect";

// --- ingest_external_knowledge ---

export const INGEST_SOURCE_DESCRIPTION =
  'Importer: "markdown" (default when documents[] is set) or "url" for HTTPS fetch (requires CLAWQL_EXTERNAL_INGEST_FETCH=1). Omit payload for roadmap preview.';
export const INGEST_DRY_RUN_DESCRIPTION =
  "Default true: validate only. Set false to write Markdown or (url mode) fetch and write.";
export const INGEST_SCOPE_DESCRIPTION =
  "Optional vault-relative .md path for url imports (default: Memory/external/<slug>.md).";
export const INGEST_DOCUMENTS_DESCRIPTION =
  "Bulk Markdown files to import when CLAWQL_EXTERNAL_INGEST=1.";
export const INGEST_DOCUMENT_PATH_DESCRIPTION = "Vault-relative path; must end with .md";
export const INGEST_DOCUMENT_MARKDOWN_DESCRIPTION = "Markdown body UTF-8 (max ~2 MiB per file).";
export const INGEST_URL_DESCRIPTION =
  "HTTPS URL to fetch when source is url and CLAWQL_EXTERNAL_INGEST_FETCH=1 (opt-in network).";

const ExternalIngestDocumentSchema = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)).annotations({
    description: INGEST_DOCUMENT_PATH_DESCRIPTION,
  }),
  markdown: Schema.String.pipe(Schema.maxLength(2_097_152)).annotations({
    description: INGEST_DOCUMENT_MARKDOWN_DESCRIPTION,
  }),
});

export const IngestExternalKnowledgeInputSchema = Schema.Struct({
  source: Schema.optional(Schema.String.annotations({ description: INGEST_SOURCE_DESCRIPTION })),
  dryRun: Schema.optional(Schema.Boolean.annotations({ description: INGEST_DRY_RUN_DESCRIPTION })),
  scope: Schema.optional(Schema.String.annotations({ description: INGEST_SCOPE_DESCRIPTION })),
  documents: Schema.optional(
    Schema.mutable(Schema.Array(ExternalIngestDocumentSchema))
      .pipe(Schema.maxItems(50))
      .annotations({ description: INGEST_DOCUMENTS_DESCRIPTION })
  ),
  url: Schema.optional(
    Schema.String.pipe(Schema.maxLength(2048)).annotations({ description: INGEST_URL_DESCRIPTION })
  ),
});

export type IngestExternalKnowledgeInputDecoded = Schema.Schema.Type<
  typeof IngestExternalKnowledgeInputSchema
>;

// --- knowledge_search_onyx ---

export const ONYX_QUERY_DESCRIPTION =
  "Natural language or keyword query against the Onyx index (maps to `search_query` on the Onyx API).";
export const ONYX_NUM_HITS_DESCRIPTION = "Max hits to return (default 15).";
export const ONYX_INCLUDE_CONTENT_DESCRIPTION =
  "Include chunk/content in results when supported (default true).";
export const ONYX_STREAM_DESCRIPTION =
  "Must be false or omitted; streaming is not supported for this tool.";
export const ONYX_RUN_QUERY_EXPANSION_DESCRIPTION =
  "Whether to run query expansion on the Onyx side (default false).";
export const ONYX_HYBRID_ALPHA_DESCRIPTION = "Optional hybrid search alpha (Onyx-specific).";
export const ONYX_FILTERS_DESCRIPTION = "Optional Onyx index filters object.";
export const ONYX_TENANT_ID_DESCRIPTION = "Optional multi-tenant id (query parameter).";
export const ONYX_FIELDS_DESCRIPTION =
  "Optional top-level JSON keys to keep from the Onyx response (same as execute `fields`).";

export const KnowledgeSearchOnyxInputSchema = Schema.Struct({
  query: Schema.String.pipe(Schema.minLength(1)).annotations({
    description: ONYX_QUERY_DESCRIPTION,
  }),
  num_hits: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(1, 100)).annotations({
      description: ONYX_NUM_HITS_DESCRIPTION,
    })
  ),
  include_content: Schema.optional(
    Schema.Boolean.annotations({ description: ONYX_INCLUDE_CONTENT_DESCRIPTION })
  ),
  stream: Schema.optional(Schema.Boolean.annotations({ description: ONYX_STREAM_DESCRIPTION })),
  run_query_expansion: Schema.optional(
    Schema.Boolean.annotations({ description: ONYX_RUN_QUERY_EXPANSION_DESCRIPTION })
  ),
  hybrid_alpha: Schema.optional(
    Schema.Number.annotations({ description: ONYX_HYBRID_ALPHA_DESCRIPTION })
  ),
  filters: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }).annotations({
      description: ONYX_FILTERS_DESCRIPTION,
    })
  ),
  tenant_id: Schema.optional(
    Schema.String.annotations({ description: ONYX_TENANT_ID_DESCRIPTION })
  ),
  fields: Schema.optional(
    Schema.mutable(Schema.Array(Schema.String)).annotations({
      description: ONYX_FIELDS_DESCRIPTION,
    })
  ),
});

export type KnowledgeSearchOnyxInputDecoded = Schema.Schema.Type<
  typeof KnowledgeSearchOnyxInputSchema
>;

// --- run_idp_pipeline ---

export const IDP_DRY_RUN_DESCRIPTION =
  "Default true: plan hops and resolve args without calling execute. Set false to run the pipeline.";
export const IDP_CORRELATION_ID_DESCRIPTION =
  "Correlation id for audit, dashboard, and optional NATS hooks.";
export const IDP_DOCUMENT_PATH_DESCRIPTION =
  "Nextcloud relative path for inbox file (substitutes ${document_path} / ${source_path} in templates).";
export const IDP_DOCUMENT_URL_DESCRIPTION =
  "HTTP(S) URL for Docling layout parse (${document_url} template). Defaults from IDP_DOCUMENT_URL or Nextcloud WebDAV.";
export const IDP_STEP_ARGS_DESCRIPTION =
  "Per operationId execute args (merged over step argsTemplate).";
export const IDP_SKIP_STAGES_DESCRIPTION =
  "Omit hops for these pipeline stages (e.g. skip paperless when using archive layer).";
export const IDP_STOP_ON_ERROR_DESCRIPTION =
  "Default true: halt remaining hops after first failure.";
export const IDP_MAX_RETRIES_DESCRIPTION =
  "Per-hop retries on execute failure (default from CLAWQL_IDP_PIPELINE_MAX_RETRIES).";
export const IDP_FROM_STEP_DESCRIPTION =
  "Inclusive start index into DEFAULT_IDP_PIPELINE (0-based).";
export const IDP_TO_STEP_DESCRIPTION = "Inclusive end index into DEFAULT_IDP_PIPELINE (0-based).";

const IdpStageSchema = Schema.Literal(
  "nextcloud",
  "docling",
  "tika",
  "gotenberg",
  "stirling",
  "paperless",
  "onyx",
  "coneshare"
);

export const RunIdpPipelineInputSchema = Schema.Struct({
  dry_run: Schema.optional(Schema.Boolean.annotations({ description: IDP_DRY_RUN_DESCRIPTION })),
  correlation_id: Schema.optional(
    Schema.String.annotations({ description: IDP_CORRELATION_ID_DESCRIPTION })
  ),
  document_path: Schema.optional(
    Schema.String.annotations({ description: IDP_DOCUMENT_PATH_DESCRIPTION })
  ),
  document_url: Schema.optional(
    Schema.String.annotations({ description: IDP_DOCUMENT_URL_DESCRIPTION })
  ),
  step_args: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    }).annotations({ description: IDP_STEP_ARGS_DESCRIPTION })
  ),
  skip_stages: Schema.optional(
    Schema.mutable(Schema.Array(IdpStageSchema)).annotations({
      description: IDP_SKIP_STAGES_DESCRIPTION,
    })
  ),
  stop_on_error: Schema.optional(
    Schema.Boolean.annotations({ description: IDP_STOP_ON_ERROR_DESCRIPTION })
  ),
  max_retries: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(0, 10)).annotations({
      description: IDP_MAX_RETRIES_DESCRIPTION,
    })
  ),
  from_step: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)).annotations({
      description: IDP_FROM_STEP_DESCRIPTION,
    })
  ),
  to_step: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)).annotations({
      description: IDP_TO_STEP_DESCRIPTION,
    })
  ),
});

export type RunIdpPipelineInputDecoded = Schema.Schema.Type<typeof RunIdpPipelineInputSchema>;

// --- classify_document ---

export const CLASSIFY_DOC_ID_DESCRIPTION = "Optional stable document id for audit trails.";
export const CLASSIFY_DOCLING_MD_DESCRIPTION =
  "Docling markdown output (primary feature signal for the classifier).";
export const CLASSIFY_DOCLING_JSON_DESCRIPTION = "Docling structured JSON (layout/tables).";
export const CLASSIFY_TEXT_DESCRIPTION = "Fallback plain text when Docling output is unavailable.";
export const CLASSIFY_MIN_CONFIDENCE_DESCRIPTION =
  "Confidence threshold for needs_hitl (default CLASSIFIER_MIN_CONFIDENCE env or 0.85).";

export const ClassifyDocumentInputSchema = Schema.Struct({
  doc_id: Schema.optional(Schema.String.annotations({ description: CLASSIFY_DOC_ID_DESCRIPTION })),
  docling_md: Schema.optional(
    Schema.String.annotations({ description: CLASSIFY_DOCLING_MD_DESCRIPTION })
  ),
  docling_json: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }).annotations({
      description: CLASSIFY_DOCLING_JSON_DESCRIPTION,
    })
  ),
  text: Schema.optional(Schema.String.annotations({ description: CLASSIFY_TEXT_DESCRIPTION })),
  min_confidence: Schema.optional(
    Schema.Number.pipe(Schema.between(0, 1)).annotations({
      description: CLASSIFY_MIN_CONFIDENCE_DESCRIPTION,
    })
  ),
});

export type ClassifyDocumentInputDecoded = Schema.Schema.Type<typeof ClassifyDocumentInputSchema>;

// --- extract_document ---

export const EXTRACT_TEXT_DESCRIPTION =
  "Unstructured source text (typically Docling markdown or Tika output). LangExtract runs after layout/text parse.";
export const EXTRACT_PROMPT_DESCRIPTION =
  "Natural-language extraction instructions for LangExtract.";
export const EXTRACT_SCHEMA_PRESET_DESCRIPTION =
  "Built-in few-shot preset when examples are omitted (w2, title_commitment, purchase_agreement, buyer_offer).";
export const EXTRACT_EXAMPLES_DESCRIPTION =
  "Few-shot LangExtract examples (text + grounded extractions).";
export const EXTRACT_MODEL_ID_DESCRIPTION =
  "LLM model id for live sidecar (default LANGEXTRACT_MODEL_ID). OpenRouter: e.g. deepseek/deepseek-chat; Ollama: e.g. gemma2:2b.";
export const EXTRACT_BACKEND_DESCRIPTION =
  "Live sidecar backend override (default LANGEXTRACT_BACKEND or openrouter). Use ollama for local models.";
export const EXTRACT_WRITE_HTML_DESCRIPTION =
  "When true, sidecar writes interactive HTML viz to disk and returns path references only.";
export const EXTRACT_DOC_ID_DESCRIPTION = "Stable id for artifact file names and audit.";

const ExtractionExampleSchema = Schema.Struct({
  extraction_class: Schema.String.pipe(Schema.minLength(1)),
  extraction_text: Schema.String.pipe(Schema.minLength(1)),
  attributes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

const ExtractExampleSchema = Schema.Struct({
  text: Schema.String.pipe(Schema.minLength(1)),
  extractions: Schema.mutable(Schema.Array(ExtractionExampleSchema)).pipe(Schema.minItems(1)),
});

export const ExtractDocumentInputSchema = Schema.Struct({
  text: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_097_152)).annotations({
    description: EXTRACT_TEXT_DESCRIPTION,
  }),
  prompt_description: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(8192)).annotations({
      description: EXTRACT_PROMPT_DESCRIPTION,
    })
  ),
  schema_preset: Schema.optional(
    Schema.Literal("w2", "title_commitment", "purchase_agreement", "buyer_offer").annotations({
      description: EXTRACT_SCHEMA_PRESET_DESCRIPTION,
    })
  ),
  examples: Schema.optional(
    Schema.mutable(Schema.Array(ExtractExampleSchema))
      .pipe(Schema.maxItems(20))
      .annotations({ description: EXTRACT_EXAMPLES_DESCRIPTION })
  ),
  model_id: Schema.optional(
    Schema.String.annotations({ description: EXTRACT_MODEL_ID_DESCRIPTION })
  ),
  backend: Schema.optional(
    Schema.Literal("openrouter", "ollama", "openai_compatible").annotations({
      description: EXTRACT_BACKEND_DESCRIPTION,
    })
  ),
  write_html: Schema.optional(
    Schema.Boolean.annotations({ description: EXTRACT_WRITE_HTML_DESCRIPTION })
  ),
  doc_id: Schema.optional(Schema.String.annotations({ description: EXTRACT_DOC_ID_DESCRIPTION })),
});

export type ExtractDocumentInputDecoded = Schema.Schema.Type<typeof ExtractDocumentInputSchema>;

function formatParseError(err: ParseResult.ParseError): Error {
  return new Error(ParseResult.TreeFormatter.formatErrorSync(err));
}

export function decodeIngestExternalKnowledgeInput(
  raw: unknown
): Effect.Effect<IngestExternalKnowledgeInputDecoded, Error> {
  return Schema.decodeUnknown(IngestExternalKnowledgeInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}

export function decodeKnowledgeSearchOnyxInput(
  raw: unknown
): Effect.Effect<KnowledgeSearchOnyxInputDecoded, Error> {
  return Schema.decodeUnknown(KnowledgeSearchOnyxInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}

export function decodeRunIdpPipelineInput(
  raw: unknown
): Effect.Effect<RunIdpPipelineInputDecoded, Error> {
  return Schema.decodeUnknown(RunIdpPipelineInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}

export function decodeClassifyDocumentInput(
  raw: unknown
): Effect.Effect<ClassifyDocumentInputDecoded, Error> {
  return Schema.decodeUnknown(ClassifyDocumentInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}

export function decodeExtractDocumentInput(
  raw: unknown
): Effect.Effect<ExtractDocumentInputDecoded, Error> {
  return Schema.decodeUnknown(ExtractDocumentInputSchema)(raw).pipe(
    Effect.mapError(formatParseError)
  );
}
