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

/** Promise façade over {@link executeKnowledgeSearchOnyxEffect}. */
export async function handleKnowledgeSearchOnyxToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const { Effect } = await import("effect");
  const { decodeKnowledgeSearchOnyxInput } = await import("../schema/index.js");
  const { executeKnowledgeSearchOnyxEffect } =
    await import("../effect/knowledge-search-onyx-effect.js");
  const parsed = await Effect.runPromise(decodeKnowledgeSearchOnyxInput(params));
  return Effect.runPromise(executeKnowledgeSearchOnyxEffect(parsed));
}
