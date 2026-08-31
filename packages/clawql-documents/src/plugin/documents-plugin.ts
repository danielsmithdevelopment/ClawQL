import {
  handleRunIdpPipelineToolInput,
  runIdpPipelineToolSchema,
} from "../pipeline/run-idp-pipeline.js";
import {
  classifyDocumentToolSchema,
  handleClassifyDocumentToolInput,
} from "../classify/classify-document.js";
import {
  extractDocumentToolSchema,
  handleExtractDocumentToolInput,
} from "../langextract/extract-document.js";
import { handleInspectPdfToolInput, inspectPdfToolSchema } from "../pdf-inspector/inspect-pdf.js";
import {
  handleConvertDocumentToolInput,
  convertDocumentToolSchema,
} from "../anydoc/convert-document.js";
import { runIngestExternalKnowledge } from "../ingest/external-ingest.js";
import { logMcpToolShape } from "clawql-api/mcp/tool-shape-log";
import { defineRegisteringProviderPlugin, type ProviderPlugin } from "clawql-core";
import { Effect } from "effect";
import {
  decodeIngestExternalKnowledgeInput,
  ingestExternalKnowledgeToolZodShape,
  knowledgeSearchOnyxToolZodShape,
} from "../schema/index.js";
import { handleKnowledgeSearchOnyxToolInput } from "./knowledge-search-onyx.js";

export const DOCUMENTS_PLUGIN_ID = "clawql-documents";

/** @deprecated Prefer {@link ingestExternalKnowledgeToolZodShape}. */
export const ingestExternalKnowledgeToolSchema = ingestExternalKnowledgeToolZodShape;
/** @deprecated Prefer {@link knowledgeSearchOnyxToolZodShape}. */
export const knowledgeSearchOnyxToolSchema = knowledgeSearchOnyxToolZodShape;

export async function handleIngestExternalKnowledgeToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeIngestExternalKnowledgeInput(params));
  logMcpToolShape("ingest_external_knowledge", {
    sourceChars: parsed.source?.length ?? 0,
    dryRun: parsed.dryRun !== false,
    hasScope: Boolean(parsed.scope?.trim()),
    documentCount: parsed.documents?.length ?? 0,
    urlChars: parsed.url?.length ?? 0,
  });
  const result = await runIngestExternalKnowledge(parsed);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

export type CreateDocumentsPluginOptions = {
  /** Register `knowledge_search_onyx` when `CLAWQL_ENABLE_ONYX=1` (requires documents tier). */
  readonly enableOnyx?: boolean;
  /** Register `run_idp_pipeline` when `CLAWQL_ENABLE_IDP_PIPELINE=1` ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)). */
  readonly enableIdpPipeline?: boolean;
  /** Register `classify_document` when `CLAWQL_ENABLE_IDP_CLASSIFIER=1` ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)). */
  readonly enableIdpClassifier?: boolean;
  /** Register `extract_document` when `CLAWQL_ENABLE_LANGEXTRACT=1` ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)). */
  readonly enableLangextract?: boolean;
  /** Register `inspect_pdf` when `CLAWQL_ENABLE_PDF_INSPECTOR=1` (Firecrawl pdf-inspector). */
  readonly enablePdfInspector?: boolean;
  /** Register `convert_document` when `CLAWQL_ENABLE_ANYDOC=1` (Firecrawl anydoc). */
  readonly enableAnydoc?: boolean;
};

export function createDocumentsPlugin(options: CreateDocumentsPluginOptions = {}): ProviderPlugin {
  const enableOnyx = options.enableOnyx ?? false;
  const enableIdpPipeline = options.enableIdpPipeline ?? false;
  const enableIdpClassifier = options.enableIdpClassifier ?? false;
  const enableLangextract = options.enableLangextract ?? false;
  const enablePdfInspector = options.enablePdfInspector ?? false;
  const enableAnydoc = options.enableAnydoc ?? false;
  return defineRegisteringProviderPlugin({
    id: DOCUMENTS_PLUGIN_ID,
    version: "0.1.0",
    description: "External knowledge ingest, Onyx search, and IDP document tools",
    register: (api) =>
      Effect.gen(function* () {
        yield* api.registerMcpTool({
          name: "ingest_external_knowledge",
          schema: ingestExternalKnowledgeToolZodShape,
          handler: (args) => handleIngestExternalKnowledgeToolInput(args),
        });
        if (enableOnyx) {
          yield* api.registerMcpTool({
            name: "knowledge_search_onyx",
            schema: knowledgeSearchOnyxToolZodShape,
            handler: (args) => handleKnowledgeSearchOnyxToolInput(args),
          });
        }
        if (enableIdpPipeline) {
          yield* api.registerMcpTool({
            name: "run_idp_pipeline",
            schema: runIdpPipelineToolSchema,
            handler: (args) => handleRunIdpPipelineToolInput(args),
          });
        }
        if (enablePdfInspector) {
          yield* api.registerMcpTool({
            name: "inspect_pdf",
            schema: inspectPdfToolSchema,
            handler: (args) => handleInspectPdfToolInput(args),
          });
        }
        if (enableAnydoc) {
          yield* api.registerMcpTool({
            name: "convert_document",
            schema: convertDocumentToolSchema,
            handler: (args) => handleConvertDocumentToolInput(args),
          });
        }
        if (enableIdpClassifier) {
          yield* api.registerMcpTool({
            name: "classify_document",
            schema: classifyDocumentToolSchema,
            handler: (args) => handleClassifyDocumentToolInput(args),
          });
        }
        if (enableLangextract) {
          yield* api.registerMcpTool({
            name: "extract_document",
            schema: extractDocumentToolSchema,
            handler: (args) => handleExtractDocumentToolInput(args),
          });
        }
      }),
  });
}
