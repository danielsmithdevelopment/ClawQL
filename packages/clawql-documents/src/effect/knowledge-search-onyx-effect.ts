/**
 * Native Effect.gen staging for knowledge_search_onyx:
 * loadSpec resolve → stream gate → execute → reshape.
 */

import { Effect } from "effect";
import { loadSpec } from "clawql-api";
import {
  resolveOnyxSendSearchOperationId,
  type KnowledgeSearchOnyxInput,
} from "../plugin/knowledge-search-onyx.js";
import { getDocumentsPluginDeps } from "../plugin/deps.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

export type OnyxMcpResult = { content: { type: "text"; text: string }[] };

function mcpJson(obj: unknown): OnyxMcpResult {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

/**
 * Onyx knowledge search as Effect.gen.
 * Spec load + execute stay behind {@link documentsFromPromise}.
 */
export function executeKnowledgeSearchOnyxEffect(
  params: KnowledgeSearchOnyxInput
): Effect.Effect<OnyxMcpResult, DocumentsError> {
  return Effect.gen(function* () {
    const loaded = yield* documentsFromPromise(() => loadSpec());
    const operationId = resolveOnyxSendSearchOperationId(loaded.operations);
    if (!operationId) {
      return mcpJson({
        error:
          "Onyx search operation is not in the loaded API index. Include bundled provider `onyx` " +
          "(e.g. `CLAWQL_BUNDLED_PROVIDERS=...,onyx` or default `all-providers`).",
      });
    }

    if (params.stream === true) {
      return mcpJson({
        error:
          "stream=true is not supported for knowledge_search_onyx; omit stream or set stream=false.",
      });
    }

    const args: Record<string, unknown> = {
      search_query: params.query,
      num_hits: params.num_hits ?? 15,
      include_content: params.include_content ?? true,
      stream: false,
      run_query_expansion: params.run_query_expansion ?? false,
    };
    if (params.hybrid_alpha !== undefined) args.hybrid_alpha = params.hybrid_alpha;
    if (params.filters !== undefined) args.filters = params.filters;
    if (params.tenant_id !== undefined && params.tenant_id !== "")
      args.tenant_id = params.tenant_id;

    const result = yield* documentsFromPromise(() =>
      getDocumentsPluginDeps().execute({
        operationId,
        args,
        fields: params.fields,
      })
    );

    return {
      content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
    };
  });
}
