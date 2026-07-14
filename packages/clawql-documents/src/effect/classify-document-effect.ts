/**
 * Native Effect.gen staging for classify_document:
 * resolve classifier URL → heuristic (sync) | HTTP POST → parse.
 * No nested {@link runDocumentsEffect} / single-shot tryPromise wrapper.
 */

import { Effect } from "effect";
import {
  heuristicClassify,
  parseClassifierHttpResponse,
  postClassifierHttp,
  type ClassifyDocumentInput,
  type ClassifyDocumentResult,
} from "../classify/classify-document.js";
import { classifierBaseUrl } from "../classify/env.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

/**
 * Classify pipeline as Effect.gen.
 * Remote fetch stays behind {@link documentsFromPromise}; heuristic + parse are sync.
 */
export function executeClassifyDocumentEffect(
  input: ClassifyDocumentInput
): Effect.Effect<ClassifyDocumentResult, DocumentsError> {
  return Effect.gen(function* () {
    const baseUrl = classifierBaseUrl();
    if (!baseUrl) {
      return heuristicClassify(input);
    }
    const response = yield* documentsFromPromise(() => postClassifierHttp(input, baseUrl));
    return parseClassifierHttpResponse(input, response);
  });
}
