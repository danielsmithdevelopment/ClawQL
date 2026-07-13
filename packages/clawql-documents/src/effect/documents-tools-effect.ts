import { Effect } from "effect";
import {
  classifyDocument,
  type ClassifyDocumentInput,
  type ClassifyDocumentResult,
} from "../classify/classify-document.js";
import {
  extractDocument,
  type ExtractDocumentInput,
  type ExtractDocumentResult,
} from "../langextract/extract-document.js";
import {
  runIdpPipeline,
  type RunIdpPipelineInput,
  type RunIdpPipelineResult,
} from "../pipeline/runner.js";
import { getDocumentsPluginDeps } from "../plugin/deps.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

/** IDP pipeline body (deps resolved at call time). */
export async function executeRunIdpPipelineCore(
  input: RunIdpPipelineInput
): Promise<RunIdpPipelineResult> {
  const deps = getDocumentsPluginDeps();
  return runIdpPipeline(input, {
    execute: (p) => deps.execute(p),
    onHop: deps.onPipelineHop,
  });
}

export function executeRunIdpPipelineEffect(
  input: RunIdpPipelineInput
): Effect.Effect<RunIdpPipelineResult, DocumentsError> {
  return documentsFromPromise(() => executeRunIdpPipelineCore(input));
}

export function executeClassifyDocumentEffect(
  input: ClassifyDocumentInput
): Effect.Effect<ClassifyDocumentResult, DocumentsError> {
  return documentsFromPromise(() => classifyDocument(input));
}

export function executeExtractDocumentEffect(
  input: ExtractDocumentInput
): Effect.Effect<ExtractDocumentResult, DocumentsError> {
  return documentsFromPromise(() => extractDocument(input));
}
