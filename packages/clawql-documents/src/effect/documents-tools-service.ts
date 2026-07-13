import { Context, Effect, Layer } from "effect";
import type {
  ClassifyDocumentInput,
  ClassifyDocumentResult,
} from "../classify/classify-document.js";
import type {
  ExtractDocumentInput,
  ExtractDocumentResult,
} from "../langextract/extract-document.js";
import type { RunIdpPipelineInput, RunIdpPipelineResult } from "../pipeline/runner.js";
import { DocumentsError } from "./documents-errors.js";
import {
  executeClassifyDocumentEffect,
  executeExtractDocumentEffect,
  executeRunIdpPipelineEffect,
} from "./documents-tools-effect.js";

/** Effect service for IDP pipeline, classify, and extract document tools. */
export class DocumentsToolsService extends Context.Tag("clawql/DocumentsToolsService")<
  DocumentsToolsService,
  {
    readonly runIdpPipeline: (
      input: RunIdpPipelineInput
    ) => Effect.Effect<RunIdpPipelineResult, DocumentsError>;
    readonly classify: (
      input: ClassifyDocumentInput
    ) => Effect.Effect<ClassifyDocumentResult, DocumentsError>;
    readonly extract: (
      input: ExtractDocumentInput
    ) => Effect.Effect<ExtractDocumentResult, DocumentsError>;
  }
>() {}

export function documentsToolsLiveLayer(): Layer.Layer<DocumentsToolsService> {
  return Layer.succeed(
    DocumentsToolsService,
    DocumentsToolsService.of({
      runIdpPipeline: executeRunIdpPipelineEffect,
      classify: executeClassifyDocumentEffect,
      extract: executeExtractDocumentEffect,
    })
  );
}
