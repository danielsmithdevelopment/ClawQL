import {
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  type GraphQLArgumentConfig,
  type GraphQLFieldConfig,
  type GraphQLFieldConfigArgumentMap,
} from "graphql";
import type { ListedMcpTool } from "mcp-grpc-transport";
import { httpBodyFromCollapsed } from "./call.js";
import { GraphQLJSON } from "./graphql-json-scalar.js";
import { isSafeToolPathName } from "./schema-convert.js";
import type { CallToolFn, ToolCatalog } from "./types.js";

export type GraphqlSchemaContext = {
  callTool: CallToolFn;
  getCatalog: () => ToolCatalog;
  /** Advertised gRPC address (upstream or scaffolded); may be unset. */
  grpcAddress?: string;
};

function isGraphqlSafeFieldName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function jsonSchemaTypeToGraphqlArg(
  propSchema: Record<string, unknown>,
  required: boolean
): GraphQLArgumentConfig | undefined {
  const t = propSchema.type;
  let base;
  if (t === "string") base = GraphQLString;
  else if (t === "boolean") base = GraphQLBoolean;
  else if (t === "number" || t === "integer") base = GraphQLFloat;
  else if (t === "array") {
    const items = propSchema.items as Record<string, unknown> | undefined;
    const itemT = items?.type;
    if (itemT === "string") base = new GraphQLList(new GraphQLNonNull(GraphQLString));
    else if (itemT === "boolean") base = new GraphQLList(new GraphQLNonNull(GraphQLBoolean));
    else if (itemT === "number" || itemT === "integer")
      base = new GraphQLList(new GraphQLNonNull(GraphQLFloat));
    else base = GraphQLJSON;
  } else if (t === "object" || propSchema.properties) {
    base = GraphQLJSON;
  } else {
    // anyOf / oneOf / missing type → JSON
    base = GraphQLJSON;
  }

  return {
    type: required ? new GraphQLNonNull(base) : base,
    description:
      typeof propSchema.description === "string" ? propSchema.description : undefined,
  };
}

/** Flatten top-level JSON Schema properties into GraphQL field args when possible. */
export function toolArgsFromInputSchema(
  inputSchema: Record<string, unknown>
): { args: GraphQLFieldConfigArgumentMap; mode: "flat" | "jsonBag" } {
  const props = inputSchema.properties as Record<string, Record<string, unknown>> | undefined;
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];

  if (!props || typeof props !== "object" || Object.keys(props).length === 0) {
    return {
      mode: "jsonBag",
      args: {
        args: {
          type: GraphQLJSON,
          description: "JSON object of MCP tool arguments (omit or pass {})",
        },
      },
    };
  }

  const args: GraphQLFieldConfigArgumentMap = {};
  for (const [key, propSchema] of Object.entries(props)) {
    if (!isGraphqlSafeFieldName(key)) {
      return {
        mode: "jsonBag",
        args: {
          args: {
            type: new GraphQLNonNull(GraphQLJSON),
            description: "JSON object of MCP tool arguments (property names are not GraphQL-safe)",
          },
        },
      };
    }
    const arg = jsonSchemaTypeToGraphqlArg(propSchema ?? {}, requiredList.includes(key));
    if (!arg) continue;
    args[key] = arg;
  }

  if (Object.keys(args).length === 0) {
    return {
      mode: "jsonBag",
      args: {
        args: {
          type: GraphQLJSON,
          description: "JSON object of MCP tool arguments (omit or pass {})",
        },
      },
    };
  }

  return { mode: "flat", args };
}

function buildToolMutationField(
  tool: ListedMcpTool,
  ctx: GraphqlSchemaContext
): GraphQLFieldConfig<unknown, unknown> | undefined {
  if (!isSafeToolPathName(tool.name) || !isGraphqlSafeFieldName(tool.name)) {
    return undefined;
  }
  const { args, mode } = toolArgsFromInputSchema(tool.inputSchema);

  const via =
    ctx.grpcAddress != null && ctx.grpcAddress.length > 0
      ? ` — also available via gRPC CallTool at ${ctx.grpcAddress}`
      : " — via MCP upstream (OpenAPI/GraphQL on-ramp)";
  return {
    type: GraphQLJSON,
    description: (tool.description || `Call MCP tool ${tool.name}`) + via,
    args,
    resolve: async (_src, fieldArgs: Record<string, unknown>) => {
      const catalog = ctx.getCatalog();
      const live = catalog.tools.find((t) => t.name === tool.name);
      if (!live) throw new Error(`unknown tool: ${tool.name}`);
      const mcpArgs =
        mode === "jsonBag"
          ? ((fieldArgs.args as Record<string, unknown> | undefined) ?? {})
          : { ...fieldArgs };
      const result = await ctx.callTool(live, mcpArgs);
      return httpBodyFromCollapsed(result);
    },
  };
}

/**
 * Build a GraphQL schema from the current MCP tool catalog.
 *
 * - Query.tools / Query.health
 * - Mutation.callTool(name, args) — generic escape hatch
 * - Mutation.<toolName>(…) — one field per tool (flattened args when possible)
 */
export function buildGraphqlSchemaFromCatalog(
  catalog: ToolCatalog,
  ctx: Omit<GraphqlSchemaContext, "getCatalog"> & { getCatalog?: () => ToolCatalog }
): GraphQLSchema {
  const fullCtx: GraphqlSchemaContext = {
    callTool: ctx.callTool,
    grpcAddress: ctx.grpcAddress ?? catalog.grpcAddress,
    getCatalog: ctx.getCatalog ?? (() => catalog),
  };

  const McpToolType = new GraphQLObjectType({
    name: "McpTool",
    fields: {
      name: { type: new GraphQLNonNull(GraphQLString) },
      description: { type: GraphQLString },
      title: { type: GraphQLString },
      inputSchema: { type: GraphQLJSON },
      outputSchema: { type: GraphQLJSON },
    },
  });

  const HealthType = new GraphQLObjectType({
    name: "GatewayHealth",
    fields: {
      status: { type: new GraphQLNonNull(GraphQLString) },
      upstream: { type: GraphQLString },
      upstreamKind: { type: GraphQLString },
      grpcAddress: { type: GraphQLString },
      toolCount: { type: new GraphQLNonNull(GraphQLFloat) },
      fetchedAt: { type: new GraphQLNonNull(GraphQLString) },
      surfaces: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))),
        resolve: (_src, _args, _ctx, info) => {
          void info;
          return fullCtx.getCatalog().surfaces;
        },
      },
    },
  });

  const query = new GraphQLObjectType({
    name: "Query",
    fields: {
      health: {
        type: new GraphQLNonNull(HealthType),
        resolve: () => {
          const c = fullCtx.getCatalog();
          return {
            status: "ok",
            upstream: c.upstream,
            upstreamKind: c.upstreamKind,
            grpcAddress: c.grpcAddress ?? fullCtx.grpcAddress ?? null,
            toolCount: c.tools.length,
            fetchedAt: c.fetchedAt,
          };
        },
      },
      tools: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(McpToolType))),
        resolve: () => fullCtx.getCatalog().tools,
      },
    },
  });

  const mutationFields: Record<string, GraphQLFieldConfig<unknown, unknown>> = {
    callTool: {
      type: GraphQLJSON,
      description: "Generic MCP CallTool by name (any upstream)",
      args: {
        name: { type: new GraphQLNonNull(GraphQLString) },
        args: {
          type: GraphQLJSON,
          description: "Tool arguments object",
        },
      },
      resolve: async (_src, fieldArgs: { name: string; args?: Record<string, unknown> }) => {
        const catalogLive = fullCtx.getCatalog();
        const tool = catalogLive.tools.find((t) => t.name === fieldArgs.name);
        if (!tool) throw new Error(`unknown tool: ${fieldArgs.name}`);
        const result = await fullCtx.callTool(tool, fieldArgs.args ?? {});
        return httpBodyFromCollapsed(result);
      },
    },
  };

  for (const tool of catalog.tools) {
    const field = buildToolMutationField(tool, fullCtx);
    if (field) mutationFields[tool.name] = field;
  }

  const mutation = new GraphQLObjectType({
    name: "Mutation",
    fields: mutationFields,
  });

  return new GraphQLSchema({
    query,
    mutation,
    description:
      "MCP tools GraphQL on-ramp. Prefer gRPC CallTool (mcp-grpc-transport) for production/mesh/large payloads.",
  });
}
