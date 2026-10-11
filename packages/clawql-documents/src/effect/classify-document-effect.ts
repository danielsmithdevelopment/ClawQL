/**
 * Native Effect.gen staging for classify_document:
 * resolve classifier URL → heuristic (sync) | HTTP POST → parse.
 * No nested {@link runDocumentsEffect} / single-shot tryPromise wrapper.
 */

import { Effect } from "effect";
import {
  heuristicClassify,
  parseClassifierHttpResponse,
  postClassifierHttpEffect,
  type ClassifyDocumentInput,
  type ClassifyDocumentResult,
} from "../classify/classify-document.js";
import { classifierBaseUrl } from "../classify/env.js";
import { DocumentsError } from "./documents-errors.js";

/**
 * Classify pipeline as Effect.gen.
 * Remote fetch via {@link postClassifierHttpEffect}; heuristic + parse are sync.
 */
export function executeClassifyDocumentEffect(
  input: ClassifyDocumentInput
): Effect.Effect<ClassifyDocumentResult, DocumentsError> {
  return Effect.gen(function* () {
    const baseUrl = classifierBaseUrl();
    if (!baseUrl) {
      return heuristicClassify(input);
    }
    const response = yield* postClassifierHttpEffect(input, baseUrl).pipe(
      Effect.mapError(
        (cause) =>
          new DocumentsError({
            reason: cause instanceof Error ? cause.message : String(cause),
            cause,
          })
      )
    );
    return parseClassifierHttpResponse(input, response);
  });
}
