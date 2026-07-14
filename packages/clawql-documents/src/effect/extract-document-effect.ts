/**
 * Native Effect.gen staging for extract_document:
 * resolve LangExtract URL → heuristic (sync) | HTTP POST → parse.
 * No nested {@link runDocumentsEffect} / single-shot tryPromise wrapper.
 */

import { Effect } from "effect";
import {
  heuristicExtract,
  parseLangextractHttpResponse,
  postLangextractHttp,
  type ExtractDocumentInput,
  type ExtractDocumentResult,
} from "../langextract/extract-document.js";
import { langextractBaseUrl } from "../langextract/env.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

/**
 * Extract pipeline as Effect.gen.
 * Remote fetch stays behind {@link documentsFromPromise}; heuristic + parse are sync.
 */
export function executeExtractDocumentEffect(
  input: ExtractDocumentInput
): Effect.Effect<ExtractDocumentResult, DocumentsError> {
  return Effect.gen(function* () {
    const baseUrl = langextractBaseUrl();
    if (!baseUrl) {
      return heuristicExtract(input);
    }
    const response = yield* documentsFromPromise(() => postLangextractHttp(input, baseUrl));
    return parseLangextractHttpResponse(response);
  });
}
