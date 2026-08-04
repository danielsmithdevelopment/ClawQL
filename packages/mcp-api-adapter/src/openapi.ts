import type { ListedMcpTool } from "mcp-grpc-transport";
import {
  asObjectRequestSchema,
  isSafeToolPathName,
  jsonSchemaToOpenApiSchema,
} from "./schema-convert.js";

export type BuildOpenApiOptions = {
  tools: ListedMcpTool[];
  title?: string;
  serverName?: string;
  /** Present when a gRPC MCP surface exists (upstream or scaffolded). */
  grpcAddress?: string;
  /** Streamable HTTP MCP path when enabled. */
  mcpPath?: string;
  publicBaseUrl?: string;
};

export function buildOpenApiDocument(options: BuildOpenApiOptions): Record<string, unknown> {
  const grpcAddr = options.grpcAddress?.trim() || undefined;
  const componentsSchemas: Record<string, unknown> = {
    McpToolResult: {
      type: "object",
      description: "Collapsed MCP CallTool result (structuredContent preferred when present).",
      additionalProperties: true,
      properties: {
        structuredContent: { type: "object", additionalProperties: true },
        content: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        isError: { type: "boolean" },
        text: { type: "string", description: "Convenience: last non-empty text content" },
      },
    },
  };

  const paths: Record<string, unknown> = {
    "/tools": {
      get: {
        operationId: "list_mcp_tools",
        summary: "List MCP tools discovered from the upstream MCP server",
        responses: {
          "200": {
            description: "Tool catalog",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tools: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    fetchedAt: { type: "string", format: "date-time" },
                    grpcAddress: { type: "string" },
                    upstream: { type: "string" },
                    upstreamKind: { type: "string" },
                    surfaces: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/healthz": {
      get: {
        operationId: "healthz",
        summary: "Liveness probe",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
  };

  for (const tool of options.tools) {
    if (!isSafeToolPathName(tool.name)) continue;
    const prefix = `tool_${tool.name.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const requestSchema = asObjectRequestSchema(
      jsonSchemaToOpenApiSchema(tool.inputSchema, componentsSchemas, prefix)
    );
    const responseSchema = tool.outputSchema
      ? jsonSchemaToOpenApiSchema(tool.outputSchema, componentsSchemas, `${prefix}_out`)
      : { $ref: "#/components/schemas/McpToolResult" };

    const grpcHint = grpcAddr
      ? `Also available via gRPC \`model_context_protocol.Mcp/CallTool\` at \`${grpcAddr}\`.`
      : "Scaffold with `--grpc-listen` (or omit `--no-grpc`) to expose a local gRPC MCP surface.";

    paths[`/${tool.name}`] = {
      post: {
        operationId: `mcp_tool__${tool.name}`,
        summary: tool.title || tool.description || `Call MCP tool ${tool.name}`,
        description: [tool.description ?? "", "", grpcHint].filter(Boolean).join("\n"),
        ...(grpcAddr
          ? {
              "x-clawql-grpc": {
                service: "model_context_protocol.Mcp",
                method: "CallTool",
                toolName: tool.name,
                address: grpcAddr,
              },
            }
          : {}),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: requestSchema,
            },
          },
        },
        responses: {
          "200": {
            description: "Tool result",
            content: {
              "application/json": {
                schema: responseSchema,
              },
            },
          },
          "400": { description: "Invalid arguments or unknown tool" },
          "502": { description: "Upstream CallTool failed" },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "MCP tools (OpenAPI on-ramp)",
      version: "0.5.1",
      description:
        "REST + GraphQL + Streamable HTTP MCP facade over any MCP server (stdio, Streamable HTTP, or gRPC). " +
        "GraphQL at /graphql (GraphiQL at /graphiql). " +
        (options.mcpPath ? `MCP endpoint at ${options.mcpPath}. ` : "") +
        (grpcAddr
          ? "Prefer gRPC CallTool for production, mesh, and large payloads. "
          : "") +
        "Powered by mcp-grpc-transport when a gRPC surface is available.",
      ...(grpcAddr
        ? {
            "x-clawql-grpc": {
              service: "model_context_protocol.Mcp",
              methods: ["ListTools", "CallTool"],
              address: grpcAddr,
              defaultPort: 50051,
              protocolVersionMetadata: "mcp-protocol-version",
              package: "mcp-grpc-transport",
              docs: "https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/mcp-grpc-transport",
              reflectionEnv: "ENABLE_GRPC_REFLECTION=1",
              largePayloadNote:
                "Prefer gRPC CallTool over Streamable HTTP / this OpenAPI on-ramp for large tool arguments (e.g. base64 documents).",
            },
          }
        : {}),
      "x-clawql-graphql": {
        endpoint: "/graphql",
        graphiql: "/graphiql",
        schema: "/graphql/schema.graphql",
        note: "Per-tool mutations + callTool(name, args); same upstream as REST.",
      },
      ...(options.mcpPath
        ? {
            "x-clawql-mcp": {
              path: options.mcpPath,
              transport: "streamable-http",
              note: "Same tools as REST/GraphQL/gRPC via MCP Streamable HTTP (IDE / agent clients).",
            },
          }
        : {}),
    },
    servers: options.publicBaseUrl
      ? [{ url: options.publicBaseUrl }]
      : [{ url: "/" }],
    paths,
    components: {
      schemas: componentsSchemas,
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  };
}
