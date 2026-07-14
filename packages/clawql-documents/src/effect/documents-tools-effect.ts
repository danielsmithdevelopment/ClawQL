import { Effect } from "effect";
import type {
  ClassifyDocumentInput,
  ClassifyDocumentResult,
} from "../classify/classify-document.js";
import type {
  ExtractDocumentInput,
  ExtractDocumentResult,
} from "../langextract/extract-document.js";
import type { RunIdpPipelineInput, RunIdpPipelineResult } from "../pipeline/runner.js";
import { getDocumentsPluginDeps } from "../plugin/deps.js";
import { DocumentsError } from "./documents-errors.js";
import { executeClassifyDocumentEffect as classifyDocumentEffect } from "./classify-document-effect.js";
import { executeExtractDocumentEffect as extractDocumentEffect } from "./extract-document-effect.js";
import { runIdpPipelineEffect } from "./idp-pipeline-effect.js";

/**
 * Resolve plugin deps then run native Effect.gen IDP hop loop
 * (no nested {@link runDocumentsEffect} / single-shot tryPromise wrapper).
 */
export function executeRunIdpPipelineEffect(
  input: RunIdpPipelineInput
): Effect.Effect<RunIdpPipelineResult, DocumentsError> {
  return Effect.gen(function* () {
    const deps = getDocumentsPluginDeps();
    return yield* runIdpPipelineEffect(input, {
      execute: (p) => deps.execute(p),
      onHop: deps.onPipelineHop,
    });
  });
}

/** @deprecated Prefer {@link executeRunIdpPipelineEffect}; kept for Promise callers. */
export async function executeRunIdpPipelineCore(
  input: RunIdpPipelineInput
): Promise<RunIdpPipelineResult> {
  return Effect.runPromise(executeRunIdpPipelineEffect(input));
}

export function executeClassifyDocumentEffect(
  input: ClassifyDocumentInput
): Effect.Effect<ClassifyDocumentResult, DocumentsError> {
  return classifyDocumentEffect(input);
}

export function executeExtractDocumentEffect(
  input: ExtractDocumentInput
): Effect.Effect<ExtractDocumentResult, DocumentsError> {
  return extractDocumentEffect(input);
}
