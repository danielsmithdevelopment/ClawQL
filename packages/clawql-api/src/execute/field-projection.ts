/**
 * Field projection and default GraphQL selection sets for execute output.
 */

function defaultExecuteOutputFields(operationId: string): string[] | undefined {
  switch (operationId) {
    case "pulls/create":
    case "pulls/update":
    case "pulls/get":
      return ["html_url", "number", "title", "state", "url"];
    case "chat_postMessage":
      return ["ok", "error", "channel", "ts", "message", "warning"];
    default:
      return undefined;
  }
}

/**
 * REST execute paths (multi-spec or GraphQL→REST fallback) return the full HTTP JSON body.
 * When the caller passed `fields`, keep only those top-level keys so behavior aligns with
 * the GraphQL selection set (nested GraphQL fragments are not parsed—list top-level names).
 */
export function projectRestByFields(data: unknown, fields: string[] | undefined): unknown {
  if (!fields?.length) return data;
  const pick = (item: unknown): unknown => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
      }
      return out;
    }
    return item;
  };
  if (Array.isArray(data)) return data.map(pick);
  return pick(data);
}

/** Effective field list for GraphQL selection and post-response projection. */
export function executeOutputFields(
  operationId: string,
  fields: string[] | undefined
): string[] | undefined {
  if (fields && fields.length > 0) return fields;
  return defaultExecuteOutputFields(operationId);
}

/** Default field selection so the agent gets useful data without specifying fields. */
export function defaultFields(operationId: string): string {
  if (operationId.includes(".services.list"))
    return "services { name uri latestReadyRevision reconciling createTime }\nnextPageToken";
  if (operationId.includes(".jobs.list"))
    return "jobs { name reconciling createTime updateTime }\nnextPageToken";
  if (operationId.includes(".executions.list"))
    return "executions { name job succeededCount failedCount runningCount createTime }\nnextPageToken";
  if (operationId.includes(".revisions.list"))
    return "revisions { name service reconciling createTime }\nnextPageToken";
  if (operationId.includes(".operations.list"))
    return "operations { name done error { code message } }\nnextPageToken";
  if (operationId.includes(".tasks.list"))
    return "tasks { name job execution createTime }\nnextPageToken";
  if (operationId.includes(".services.get"))
    return "name uri latestReadyRevision latestCreatedRevision reconciling terminalCondition { type state message } createTime updateTime";
  if (operationId.includes(".jobs.get"))
    return "name reconciling terminalCondition { type state message } latestCreatedExecution { name createTime } createTime updateTime";
  if (operationId.includes(".operations.get") || operationId.includes(".operations.wait"))
    return "name done error { code message } metadata";
  if (operationId.includes(".executions.get"))
    return "name job succeededCount failedCount runningCount completionTime createTime";
  if (operationId.includes("IamPolicy")) return "version bindings { role members }";
  if (
    operationId.includes(".create") ||
    operationId.includes(".patch") ||
    operationId.includes(".delete") ||
    operationId.includes(".run") ||
    operationId.includes(".cancel")
  )
    return "name done error { code message }";
  return "name";
}
