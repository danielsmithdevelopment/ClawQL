import { loadSpec } from "clawql-api";
import { getDocumentsPluginDeps } from "./deps.js";

/** Current upstream OpenAPI `operationId` for `POST /search/send-search-message`. */
export const ONYX_SEND_SEARCH_OPERATION_ID = "handle_send_search_message";

const ONYX_SEND_SEARCH_OPERATION_ID_LEGACY = "onyx_send_search_message";

export function resolveOnyxSendSearchOperationId(operations: { id: string }[]): string | undefined {
  for (const id of [ONYX_SEND_SEARCH_OPERATION_ID, ONYX_SEND_SEARCH_OPERATION_ID_LEGACY]) {
    const merged = `onyx::${id}`;
    if (operations.some((o) => o.id === merged)) return merged;
    if (operations.some((o) => o.id === id)) return id;
  }
  return undefined;
}

export type KnowledgeSearchOnyxInput = {
  query: string;
  num_hits?: number;
  include_content?: boolean;
  stream?: boolean;
  run_query_expansion?: boolean;
  hybrid_alpha?: number;
  filters?: Record<string, unknown>;
  tenant_id?: string;
  fields?: string[];
};

export async function handleKnowledgeSearchOnyxToolInput(
  params: KnowledgeSearchOnyxInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const loaded = await loadSpec();
  const operationId = resolveOnyxSendSearchOperationId(loaded.operations);
  if (!operationId) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "Onyx search operation is not in the loaded API index. Include bundled provider `onyx` " +
              "(e.g. `CLAWQL_BUNDLED_PROVIDERS=...,onyx` or default `all-providers`).",
          }),
        },
      ],
    };
  }

  if (params.stream === true) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "stream=true is not supported for knowledge_search_onyx; omit stream or set stream=false.",
          }),
        },
      ],
    };
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
  if (params.tenant_id !== undefined && params.tenant_id !== "") args.tenant_id = params.tenant_id;

  const result = await getDocumentsPluginDeps().execute({
    operationId,
    args,
    fields: params.fields,
  });
  return {
    content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
  };
}
