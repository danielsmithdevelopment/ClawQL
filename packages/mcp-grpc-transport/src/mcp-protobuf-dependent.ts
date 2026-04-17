/**
 * Protobuf MCP `dependent_requests` / `dependent_responses` (server-initiated sampling, roots, elicitation).
 *
 * Reference servers (including the community Python gRPC PoC) often complete server→client work in-process and
 * leave `ResponseFields.dependent_requests` empty. This module is for **gRPC clients** that talk to servers
 * which *do* populate those fields, so callers can retry the same unary RPC until the response is complete.
 */

import { jsonToStruct, structToJson } from "./mcp-protobuf-struct.js";

/** Handlers for fulfilling `ServerInitiatedRequest` entries (MCP JSON-RPC–shaped inputs/outputs). */
export type DependentHandlers = {
  /**
   * `sampling/createMessage` — params match MCP {@link CreateMessageRequest} `params` (messages, preferences, …).
   * Result should match `CreateMessageResult` shape (`message`, `model`, `stopReason`, …).
   */
  samplingCreateMessage?: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** `roots/list` — result should be `{ roots: [{ uri, name? }, …] }`. */
  listRoots?: (ctx: { notifyOnRootListUpdate: boolean }) => Promise<Record<string, unknown>>;
  /** `elicitation/create` — params `{ message, requestedSchema?, requiredFields? }`; result `{ type, content? }`. */
  elicit?: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type UnaryWithCommon = { common?: Record<string, unknown> };

function protoRoleToMcp(role: unknown): "user" | "assistant" {
  if (role === "ROLE_ASSISTANT" || role === 2 || role === "2") {
    return "assistant";
  }
  return "user";
}

/** Convert protobuf `SamplingMessage` (loader object) → MCP sampling message content block. */
export function protoSamplingMessageToMcp(msg: Record<string, unknown>): { role: "user" | "assistant"; content: Record<string, unknown> } {
  const role = protoRoleToMcp(msg.role);
  const t = msg.text as { text?: string } | undefined;
  if (t?.text != null) {
    return { role, content: { type: "text", text: String(t.text) } };
  }
  const img = msg.image as { data?: Buffer | Uint8Array; mime_type?: string } | undefined;
  if (img?.data != null) {
    const buf = Buffer.isBuffer(img.data) ? img.data : Buffer.from(img.data as Uint8Array);
    return {
      role,
      content: {
        type: "image",
        data: buf.toString("base64"),
        mimeType: String(img.mime_type ?? "application/octet-stream"),
      },
    };
  }
  const aud = msg.audio as { data?: Buffer | Uint8Array; mime_type?: string } | undefined;
  if (aud?.data != null) {
    const buf = Buffer.isBuffer(aud.data) ? aud.data : Buffer.from(aud.data as Uint8Array);
    return {
      role,
      content: {
        type: "audio",
        data: buf.toString("base64"),
        mimeType: String(aud.mime_type ?? "application/octet-stream"),
      },
    };
  }
  return { role, content: { type: "text", text: "" } };
}

/** Map MCP `CreateMessageResult` shape (`role` + `content` at top level) → protobuf `SamplingMessage`. */
function mcpCreateMessageResultToProtoSamplingMessage(res: Record<string, unknown>): Record<string, unknown> {
  const role = res.role === "assistant" ? "ROLE_ASSISTANT" : "ROLE_USER";
  const c = res.content as Record<string, unknown> | undefined;
  if (!c?.type) {
    return { role, text: { text: "" } };
  }
  if (c.type === "text") {
    return { role, text: { text: String(c.text ?? "") } };
  }
  if (c.type === "image") {
    return {
      role,
      image: {
        data: Buffer.from(String(c.data ?? ""), "base64"),
        mime_type: String(c.mimeType ?? "application/octet-stream"),
      },
    };
  }
  if (c.type === "audio") {
    return {
      role,
      audio: {
        data: Buffer.from(String(c.data ?? ""), "base64"),
        mime_type: String(c.mimeType ?? "application/octet-stream"),
      },
    };
  }
  return { role, text: { text: JSON.stringify(c) } };
}

function samplingRequestProtoToMcpParams(req: Record<string, unknown>): Record<string, unknown> {
  const messages = (req.messages as unknown[]) ?? [];
  const out: Record<string, unknown> = {
    messages: messages.map((m) => protoSamplingMessageToMcp(m as Record<string, unknown>)),
  };
  if (req.model_preferences != null) {
    out.modelPreferences = req.model_preferences;
  }
  if (req.system_prompt != null) {
    out.systemPrompt = req.system_prompt;
  }
  if (req.include_context != null) {
    out.includeContext = req.include_context;
  }
  if (req.temperature != null) {
    out.temperature = req.temperature;
  }
  if (req.max_tokens != null) {
    out.maxTokens = req.max_tokens;
  }
  if (req.stop_sequence != null) {
    out.stopSequences = req.stop_sequence;
  }
  return out;
}

function samplingResultMcpToProto(res: Record<string, unknown>): Record<string, unknown> {
  const messageProto = mcpCreateMessageResultToProtoSamplingMessage(res);
  return {
    sampling_create_message_result: {
      message: messageProto,
      model: String(res.model ?? ""),
      stop_reason: res.stopReason != null ? String(res.stopReason) : "",
    },
  };
}

function listRootsResultMcpToProto(res: Record<string, unknown>): Record<string, unknown> {
  const rootsIn = (res.roots as Array<Record<string, unknown>>) ?? [];
  const roots = rootsIn.map((r) => ({
    uri: String(r.uri ?? ""),
    name: r.name != null ? String(r.name) : "",
  }));
  return {
    root_list_result: { roots },
  };
}

function elicitResultMcpToProto(res: Record<string, unknown>): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    accept: "TYPE_ACCEPT",
    decline: "TYPE_DECLINE",
    cancel: "TYPE_CANCEL",
  };
  const action = String(res.action ?? res.type ?? "accept").toLowerCase();
  const protoType = typeMap[action] ?? "TYPE_ACCEPT";
  const content = res.content;
  return {
    elicit_result: {
      type: protoType,
      content: content != null && typeof content === "object" ? jsonToStruct(content as object) : { fields: {} },
    },
  };
}

function elicitRequestProtoToMcpParams(req: Record<string, unknown>): Record<string, unknown> {
  const schema = req.requested_schema as Record<string, unknown> | undefined;
  return {
    message: String(req.message ?? ""),
    requestedSchema: schema ?? {},
    requiredFields: (req.required_fields as string[]) ?? [],
  };
}

/**
 * Fulfill a `dependent_requests` map from a protobuf response. Returns `dependent_responses` entries keyed the same way.
 */
export async function fulfillDependentRequests(
  dependentRequests: Record<string, Record<string, unknown>>,
  handlers: DependentHandlers
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, sir] of Object.entries(dependentRequests)) {
    if (sir.sampling_create_message != null) {
      if (!handlers.samplingCreateMessage) {
        throw new Error(`dependent_requests[${id}]: sampling_create_message requires handlers.samplingCreateMessage`);
      }
      const params = samplingRequestProtoToMcpParams(sir.sampling_create_message as Record<string, unknown>);
      const mcpRes = await handlers.samplingCreateMessage(params);
      out[id] = samplingResultMcpToProto(mcpRes);
      continue;
    }
    if ("list_roots_request" in sir || "notify_on_root_list_update" in sir) {
      if (!handlers.listRoots) {
        throw new Error(`dependent_requests[${id}]: list_roots requires handlers.listRoots`);
      }
      const notify = Boolean(sir.notify_on_root_list_update);
      const mcpRes = await handlers.listRoots({ notifyOnRootListUpdate: notify });
      out[id] = listRootsResultMcpToProto(mcpRes);
      continue;
    }
    if (sir.elicit_request != null) {
      if (!handlers.elicit) {
        throw new Error(`dependent_requests[${id}]: elicit_request requires handlers.elicit`);
      }
      const params = elicitRequestProtoToMcpParams(sir.elicit_request as Record<string, unknown>);
      const mcpRes = await handlers.elicit(params);
      out[id] = elicitResultMcpToProto(mcpRes);
      continue;
    }
    throw new Error(`dependent_requests[${id}]: unsupported or empty ServerInitiatedRequest`);
  }
  return out;
}

function mergeDependentResponses(
  previous: Record<string, unknown> | undefined,
  newBatch: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  return { ...(previous ?? {}), ...newBatch };
}

/**
 * Invoke a unary-style RPC repeatedly until `response.common.dependent_requests` is empty, merging fulfilled
 * responses into `common.dependent_responses` between rounds.
 *
 * @param initialCommon - Starting `RequestFields` (proto-loader object), e.g. `{ cursor: "x" }`.
 * @param invoke - Calls the gRPC method with `{ common: merged }` and returns the full response object.
 * @param handlers - User code that implements MCP client capabilities for server-initiated work.
 */
export async function runUnaryWithDependents<T extends UnaryWithCommon>(
  initialCommon: Record<string, unknown>,
  invoke: (common: Record<string, unknown>) => Promise<T>,
  handlers: DependentHandlers,
  options?: { maxRounds?: number }
): Promise<T> {
  const maxRounds = options?.maxRounds ?? 64;
  let common: Record<string, unknown> = { ...initialCommon };
  for (let round = 0; round < maxRounds; round++) {
    const res = await invoke(common);
    const dr = res.common?.dependent_requests as Record<string, Record<string, unknown>> | undefined;
    if (!dr || Object.keys(dr).length === 0) {
      return res;
    }
    const fulfilled = await fulfillDependentRequests(dr, handlers);
    common = {
      ...common,
      dependent_responses: mergeDependentResponses(common.dependent_responses as Record<string, unknown> | undefined, fulfilled),
    };
  }
  throw new Error("runUnaryWithDependents: maxRounds exceeded");
}

/** Parse `resume_data` Struct to a plain object (optional echo / continuation state). */
export function parseResumeData(common: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (common?.resume_data == null) {
    return undefined;
  }
  return structToJson(common.resume_data as { fields?: Record<string, unknown> });
}

/** Encode resume data for the next request. */
export function encodeResumeData(data: Record<string, unknown>): { resume_data: ReturnType<typeof jsonToStruct> } {
  return { resume_data: jsonToStruct(data) };
}
