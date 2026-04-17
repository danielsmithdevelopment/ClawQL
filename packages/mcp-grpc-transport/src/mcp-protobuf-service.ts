import { randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  checkMcpProtocolVersion,
  getMetadataValue,
  grpcError,
  LATEST_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_METADATA_KEY,
  sendMcpProtocolMetadata,
} from "./grpc-mcp-metadata.js";
import {
  buildResponseCommon,
  isAbortError,
  listParamsFromCommon,
  parseRequestCommon,
  protoLogLevelToMcp,
} from "./mcp-protobuf-fields.js";
import { protobufRpcLogStorage } from "./mcp-protobuf-logging.js";
import { defaultListTtlDuration, jsonToStruct } from "./mcp-protobuf-struct.js";
import type { McpProtobufBridge } from "./mcp-protobuf-bridge.js";
import type { TaskCancellationRegistry } from "./mcp-protobuf-tasks.js";

const MCP_TOOL_NAME_KEY = "mcp-tool-name";
const MCP_RESOURCE_URI_KEY = "mcp-resource-uri";
/** Optional routing hint (aligns with proto comments for `GetPrompt`). */
const MCP_PROMPT_NAME_KEY = "mcp_prompt";

function mapRole(aud: string | undefined): string {
  if (aud === "user") {
    return "ROLE_USER";
  }
  if (aud === "assistant") {
    return "ROLE_ASSISTANT";
  }
  return "ROLE_UNKNOWN";
}

function mapResourceAnnotations(a: { audience?: ("user" | "assistant")[]; priority?: number } | undefined) {
  if (!a) {
    return undefined;
  }
  return {
    audience: (a.audience ?? []).map((x) => mapRole(x)),
    priority: a.priority ?? 0,
  };
}

function mapToolAnnotations(
  a:
    | {
        title?: string;
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      }
    | undefined
) {
  if (!a) {
    return undefined;
  }
  return {
    title: a.title ?? "",
    read_only_hint: a.readOnlyHint ?? false,
    destructive_hint: a.destructiveHint ?? false,
    idempotent_hint: a.idempotentHint ?? false,
    open_world_hint: a.openWorldHint ?? false,
  };
}

function toolResultToCallToolResponse(
  result: Record<string, unknown>,
  commonPatch?: Record<string, unknown>
): Record<string, unknown> {
  const contentIn = (result.content ?? []) as Array<Record<string, unknown>>;
  const content = contentIn.map((c) => {
    const t = c.type;
    if (t === "text") {
      return { text: { text: String(c.text ?? "") } };
    }
    if (t === "image") {
      return {
        image: {
          data: Buffer.from(String(c.data ?? ""), "utf8"),
          mime_type: String(c.mimeType ?? "application/octet-stream"),
        },
      };
    }
    if (t === "audio") {
      return {
        audio: {
          data: Buffer.from(String(c.data ?? ""), "utf8"),
          mime_type: String(c.mimeType ?? "application/octet-stream"),
        },
      };
    }
    if (t === "resource") {
      const r = c.resource as Record<string, unknown> | undefined;
      if (r && "text" in r) {
        return {
          embedded_resource: {
            contents: {
              uri: String(r.uri ?? ""),
              mime_type: String(r.mimeType ?? ""),
              text: String(r.text ?? ""),
            },
          },
        };
      }
      if (r && "blob" in r) {
        return {
          embedded_resource: {
            contents: {
              uri: String(r.uri ?? ""),
              mime_type: String(r.mimeType ?? ""),
              blob: Buffer.from(String(r.blob ?? ""), "base64"),
            },
          },
        };
      }
    }
    return { text: { text: JSON.stringify(c) } };
  });

  const structured = result.structuredContent;
  return {
    common: commonPatch ?? {},
    content,
    structured_content:
      structured && typeof structured === "object" ? jsonToStruct(structured as object) : undefined,
    is_error: result.isError === true,
  };
}

function mapGrpcError(e: unknown): grpc.ServiceError {
  if (e instanceof McpError) {
    if (e.code === ErrorCode.InvalidParams) {
      return grpcError(grpc.status.INVALID_ARGUMENT, e.message);
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return grpcError(grpc.status.INTERNAL, `An internal error occurred: ${msg}`);
}

async function applyRequestLogLevel(client: Client, logLevel: string | undefined): Promise<void> {
  const lvl = protoLogLevelToMcp(logLevel);
  if (lvl) {
    await client.setLoggingLevel(lvl);
  }
}

/**
 * gRPC `model_context_protocol.Mcp` service implementation (protobuf MCP RPCs + `mcp-protocol-version` metadata).
 */
type UnaryHandler<Req, Res> = (
  call: grpc.ServerUnaryCall<Req, Res>,
  callback: grpc.sendUnaryData<Res>
) => void;

export function createMcpProtobufServiceImplementation(
  bridge: McpProtobufBridge,
  taskRegistry: TaskCancellationRegistry
): grpc.UntypedServiceImplementation {
  return {
    ListResources: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          try {
            const req = call.request as Record<string, unknown>;
            const parsed = parseRequestCommon(req);
            const out = await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              const params = listParamsFromCommon(parsed);
              return client.listResources(params);
            });
            const resources = (out.resources ?? []).map((r) => ({
              uri: r.uri,
              name: r.name,
              title: r.title,
              description: r.description,
              mime_type: r.mimeType,
              annotations: mapResourceAnnotations(r.annotations),
              size: r.size !== undefined ? Number(r.size) : undefined,
            }));
            callback(null, {
              common: buildResponseCommon(bridge, out),
              resources,
              ttl: defaultListTtlDuration(),
            });
          } catch (e) {
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    ListResourceTemplates: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          try {
            const req = call.request as Record<string, unknown>;
            const parsed = parseRequestCommon(req);
            const out = await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              const params = listParamsFromCommon(parsed);
              return client.listResourceTemplates(params);
            });
            const resource_templates = (out.resourceTemplates ?? []).map((t) => ({
              uri_template: t.uriTemplate,
              name: t.name,
              title: t.title,
              description: t.description,
              mime_type: t.mimeType,
              annotations: mapResourceAnnotations(t.annotations),
            }));
            callback(null, {
              common: buildResponseCommon(bridge, out),
              resource_templates,
              ttl: defaultListTtlDuration(),
            });
          } catch (e) {
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    ReadResource: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          const uri = String((call.request as { uri?: string }).uri ?? "");
          const uriHint = getMetadataValue(call.metadata, MCP_RESOURCE_URI_KEY);
          if (uriHint && uriHint !== uri) {
            callback(
              grpcError(grpc.status.INVALID_ARGUMENT, `mcp-resource-uri metadata mismatch for resource ${uri}`)
            );
            return;
          }
          try {
            const req = call.request as Record<string, unknown>;
            const parsed = parseRequestCommon(req);
            const out = await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              return client.readResource({ uri });
            });
            const resource = (out.contents ?? []).map((item) => {
              if ("text" in item) {
                return {
                  uri: item.uri,
                  mime_type: item.mimeType ?? "",
                  text: item.text,
                };
              }
              return {
                uri: item.uri,
                mime_type: item.mimeType ?? "",
                blob: Buffer.from(String((item as { blob: string }).blob), "base64"),
              };
            });
            callback(null, { common: buildResponseCommon(bridge, out), resource });
          } catch (e) {
            if (e instanceof McpError && e.code === ErrorCode.InvalidParams) {
              callback(grpcError(grpc.status.NOT_FOUND, `Resource not found: ${e.message}`));
              return;
            }
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    ListPrompts: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          try {
            const req = call.request as Record<string, unknown>;
            const parsed = parseRequestCommon(req);
            const out = await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              const params = listParamsFromCommon(parsed);
              return client.listPrompts(params);
            });
            const prompts = (out.prompts ?? []).map((p) => ({
              name: p.name,
              title: p.title,
              description: p.description,
              arguments: (p.arguments ?? []).map((a) => ({
                name: a.name,
                title: "title" in a ? (a as { title?: string }).title : undefined,
                description: a.description,
                required: a.required,
              })),
            }));
            callback(null, {
              common: buildResponseCommon(bridge, out),
              prompts,
              ttl: defaultListTtlDuration(),
            });
          } catch (e) {
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    GetPrompt: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          const req = call.request as { name?: string; arguments?: Record<string, unknown>; common?: unknown };
            const nameHint = getMetadataValue(call.metadata, MCP_PROMPT_NAME_KEY);
          try {
            const parsed = parseRequestCommon(req as Record<string, unknown>);
            if (nameHint && nameHint !== String(req.name ?? "")) {
              callback(
                grpcError(grpc.status.INVALID_ARGUMENT, `mcp_prompt metadata mismatch for prompt ${String(req.name ?? "")}`)
              );
              return;
            }
            const out = await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              return client.getPrompt({
                name: String(req.name ?? ""),
                arguments: (req.arguments ?? {}) as Record<string, string>,
              });
            });
            callback(null, {
              common: buildResponseCommon(bridge, out),
              description: out.description,
              messages: out.messages,
            });
          } catch (e) {
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    ListTools: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          try {
            const req = call.request as Record<string, unknown>;
            const parsed = parseRequestCommon(req);
            const out = await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              const params = listParamsFromCommon(parsed);
              return client.listTools(params);
            });
            const tools = (out.tools ?? []).map((t) => ({
              name: t.name,
              title: t.title,
              description: t.description,
              input_schema: t.inputSchema ? jsonToStruct(t.inputSchema as object) : { fields: {} },
              output_schema: t.outputSchema ? jsonToStruct(t.outputSchema as object) : undefined,
              annotations: mapToolAnnotations(t.annotations),
            }));
            callback(null, {
              common: buildResponseCommon(bridge, out),
              tools,
              ttl: defaultListTtlDuration(),
            });
          } catch (e) {
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    CallTool: (call: grpc.ServerWritableStream<Record<string, unknown>, Record<string, unknown>>) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          call.emit("error", grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        const req = call.request as {
          request?: { name?: string; arguments?: Record<string, unknown> };
          common?: { progress?: { progress_token?: string } };
        };
        if (!req.request?.name) {
          call.emit("error", grpcError(grpc.status.INVALID_ARGUMENT, "Initial request cannot be empty."));
          return;
        }
        const toolHint = getMetadataValue(call.metadata, MCP_TOOL_NAME_KEY);
        if (toolHint && toolHint !== req.request.name) {
          call.emit(
            "error",
            grpcError(grpc.status.INVALID_ARGUMENT, `mcp-tool-name metadata mismatch for tool ${req.request.name}`)
          );
          return;
        }
        const parsed = parseRequestCommon(req as Record<string, unknown>);
        const progressToken = (req.common as { progress?: { progress_token?: string } } | undefined)?.progress
          ?.progress_token;
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          const taskId = randomUUID();
          const ac = new AbortController();
          taskRegistry.register(taskId, ac);
          try {
            const initialCommon = {
              ...buildResponseCommon(bridge, undefined),
              task_id: taskId,
            };
            call.write({ common: initialCommon });
            await bridge.run(async (client) => {
              await applyRequestLogLevel(client, parsed.log_level);
              const result = (await client.callTool(
                {
                  name: req.request!.name!,
                  arguments: (req.request!.arguments ?? {}) as Record<string, unknown>,
                },
                undefined,
                {
                  signal: ac.signal,
                  onprogress: (p) => {
                    call.write({
                      common: {
                        progress: {
                          progress_token: typeof progressToken === "string" ? progressToken : "",
                          progress: typeof p.progress === "number" ? p.progress : 0,
                          total: typeof p.total === "number" ? p.total : 0,
                          message: typeof p.message === "string" ? p.message : "",
                        },
                      },
                    });
                  },
                }
              )) as Record<string, unknown>;
              call.write(
                toolResultToCallToolResponse(result, buildResponseCommon(bridge, result as { _meta?: Record<string, unknown> }))
              );
              call.end();
            });
          } catch (e) {
            if (isAbortError(e)) {
              call.write(
                toolResultToCallToolResponse(
                  {
                    content: [{ type: "text", text: "Cancelled" }],
                    isError: true,
                  },
                  buildResponseCommon(bridge, undefined)
                )
              );
              call.end();
              return;
            }
            const msg = e instanceof Error ? e.message : String(e);
            call.write(
              toolResultToCallToolResponse(
                {
                  content: [{ type: "text", text: `Error executing tool ${req.request!.name}: ${msg}` }],
                  isError: true,
                },
                buildResponseCommon(bridge, undefined)
              )
            );
            call.end();
          } finally {
            taskRegistry.unregister(taskId);
          }
        });
      })();
    },

    Complete: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        await protobufRpcLogStorage.run({ logs: [] }, async () => {
          const req = call.request as Record<string, unknown>;
          try {
            const parsed = parseRequestCommon(req);
            const resourceRef = req.resource_reference as { uri?: string } | undefined;
            const promptRef = req.prompt_reference as { name?: string } | undefined;
            const argument = req.argument as { name?: string; value?: string } | undefined;
            const context = req.context as { arguments?: Record<string, string> } | undefined;
            if (resourceRef?.uri != null) {
              const out = await bridge.run(async (client) => {
                await applyRequestLogLevel(client, parsed.log_level);
                return client.complete({
                  ref: { type: "ref/resource", uri: String(resourceRef.uri) },
                  argument: { name: argument?.name ?? "", value: argument?.value ?? "" },
                  context: context?.arguments ? { arguments: context.arguments } : undefined,
                });
              });
              callback(null, {
                common: buildResponseCommon(bridge, out),
                values: out.completion.values,
                total_matches: out.completion.total,
                has_more: out.completion.hasMore,
              });
              return;
            }
            if (promptRef?.name != null) {
              const out = await bridge.run(async (client) => {
                await applyRequestLogLevel(client, parsed.log_level);
                return client.complete({
                  ref: { type: "ref/prompt", name: String(promptRef.name) },
                  argument: { name: argument?.name ?? "", value: argument?.value ?? "" },
                  context: context?.arguments ? { arguments: context.arguments } : undefined,
                });
              });
              callback(null, {
                common: buildResponseCommon(bridge, out),
                values: out.completion.values,
                total_matches: out.completion.total,
                has_more: out.completion.hasMore,
              });
              return;
            }
            callback(grpcError(grpc.status.INVALID_ARGUMENT, "Complete request missing resource or prompt reference"));
          } catch (e) {
            callback(mapGrpcError(e));
          }
        });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,

    CancelTask: ((call, callback) => {
      void (async () => {
        const check = checkMcpProtocolVersion(call.metadata);
        if (!check.ok) {
          sendMcpProtocolMetadata(call, LATEST_PROTOCOL_VERSION);
          callback(grpcError(grpc.status.UNIMPLEMENTED, check.details));
          return;
        }
        sendMcpProtocolMetadata(call, check.version);
        const parsed = parseRequestCommon(call.request as Record<string, unknown>);
        if (!parsed.task_id) {
          callback(grpcError(grpc.status.INVALID_ARGUMENT, "common.task_id is required for CancelTask"));
          return;
        }
        const ok = taskRegistry.cancel(parsed.task_id);
        if (!ok) {
          callback(grpcError(grpc.status.NOT_FOUND, `No active task for task_id: ${parsed.task_id}`));
          return;
        }
        callback(null, { common: buildResponseCommon(bridge, undefined) });
      })();
    }) as UnaryHandler<Record<string, unknown>, Record<string, unknown>>,
  };
}

export { MCP_PROMPT_NAME_KEY, MCP_RESOURCE_URI_KEY, MCP_TOOL_NAME_KEY, MCP_PROTOCOL_VERSION_METADATA_KEY };
