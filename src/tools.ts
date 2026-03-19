/**
 * tools.ts
 *
 * Two tools only — exactly like the Cloudflare Code Mode pattern:
 *
 *   search(query)              — discover operations from the spec
 *   execute(operationId, args) — run one, with GraphQL field selection internally
 *
 * The agent workflow:
 *   1. search("list services in a region")
 *      → returns matching operations with their parameters
 *   2. execute("run.projects.locations.services.list", { parent: "projects/my-proj/locations/us-central1" })
 *      → MCP server constructs a targeted GraphQL query internally
 *      → only requested fields come back
 *      → lean response returned to agent
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadSpec } from "./spec-loader.js";
import { searchOperations, formatSearchResults } from "./spec-search.js";
import { createGraphQLClient } from "./graphql-client.js";
import type { Operation } from "./spec-loader.js";

const gql = createGraphQLClient();
type GraphQLFieldInfo = { name: string; args: string[] };
let schemaFieldCachePromise: Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
}> | null = null;

export function registerTools(server: McpServer) {

  // ─────────────────────────────────────────
  // search()
  // ─────────────────────────────────────────
  server.tool(
    "search",
    {
      query: z
        .string()
        .describe(
          "Natural language description of what you want to do. " +
          "E.g. 'list services in a region', 'delete a revision', " +
          "'get IAM policy for a job', 'cancel a running execution'."
        ),
      limit: z
        .number().int().min(1).max(10).default(5)
        .describe("Max number of matching operations to return."),
    },
    async ({ query, limit }) => {
      const { operations } = await loadSpec();
      const results = searchOperations(operations, query, limit);
      return {
        content: [{ type: "text", text: formatSearchResults(results) }],
      };
    }
  );

  // ─────────────────────────────────────────
  // execute()
  // ─────────────────────────────────────────
  server.tool(
    "execute",
    {
      operationId: z
        .string()
        .describe(
          "The operation ID from search() results. " +
          "E.g. 'run.projects.locations.services.list'."
        ),
      args: z
        .record(z.unknown())
        .describe(
          "Key/value map of parameters for the operation (path + query params). " +
          "E.g. { parent: 'projects/my-proj/locations/us-central1', pageSize: 10 }"
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional response fields to return. Fewer fields = smaller context window usage. " +
          "Omit to get a sensible default. E.g. ['name', 'uri', 'latestReadyRevision']"
        ),
    },
    async ({ operationId, args, fields }) => {
      const { operations } = await loadSpec();
      const op = operations.find((o) => o.id === operationId);

      if (!op) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Unknown operationId: "${operationId}". Use search() to find valid operation IDs.`,
            }),
          }],
        };
      }

      const isGet = op.method === "GET";
      const gqlOpType = isGet ? "query" : "mutation";
      const { fieldName, fieldArgs } = await resolveGraphQLField(op, gqlOpType);
      const normalizedArgs = normalizeArgsForField(op, args, fieldArgs);
      const selectedFields = fields?.length
        ? fields.join("\n        ")
        : defaultFields(operationId);

      const varDecls = buildVarDeclarations(op, normalizedArgs);
      const varArgs = buildVarArgs(normalizedArgs);

      const gqlDocument = `
        ${gqlOpType} Execute(${varDecls}) {
          ${fieldName}(${varArgs}) {
            ${selectedFields}
          }
        }
      `;

      try {
        const data = await gql.query<Record<string, unknown>>(gqlDocument, normalizedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(data[fieldName], null, 2) }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: String(err),
              hint: "Check args match parameters from search(). Common aggregate args like 'parent'/'name' are auto-expanded when possible.",
            }),
          }],
        };
      }
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Derive the GraphQL query name from a Discovery operation.
 * openapi-to-graphql uses the flatPath to name fields, e.g.:
 *   flatPath: "v2/projects/{projectsId}/locations/{locationsId}/services"
 *   method:   list
 *   → v2ProjectsLocationsServicesList
 */
function operationIdToGraphQLName(op: Operation): string {
  const segments = op.flatPath
    .split("/")
    .filter((s) => !s.startsWith("{") && s.length > 0);

  const methodSuffix = op.id.split(".").pop() ?? "";

  return (
    segments[0] +
    segments.slice(1).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("") +
    methodSuffix.charAt(0).toUpperCase() + methodSuffix.slice(1)
  );
}

function operationIdToRunStyleName(op: Operation): string {
  const parts = op.id.split(".");
  if (parts.length === 0) return op.id;
  return parts[0] + parts.slice(1).map(capitalize).join("");
}

function lowerFirst(input: string): string {
  return input ? input.charAt(0).toLowerCase() + input.slice(1) : input;
}

function capitalize(input: string): string {
  return input ? input.charAt(0).toUpperCase() + input.slice(1) : input;
}

async function getSchemaFieldCache(): Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
}> {
  if (!schemaFieldCachePromise) {
    schemaFieldCachePromise = gql.query<{
      __schema: {
        queryType: { fields: Array<{ name: string; args: Array<{ name: string }> }> };
        mutationType: { fields: Array<{ name: string; args: Array<{ name: string }> }> } | null;
      };
    }>(`
      query IntrospectRootFields {
        __schema {
          queryType { fields { name args { name } } }
          mutationType { fields { name args { name } } }
        }
      }
    `).then((data) => ({
      query: data.__schema.queryType.fields.map((f) => ({
        name: f.name,
        args: f.args.map((a) => a.name),
      })),
      mutation: (data.__schema.mutationType?.fields ?? []).map((f) => ({
        name: f.name,
        args: f.args.map((a) => a.name),
      })),
    }));
  }
  return schemaFieldCachePromise;
}

async function resolveGraphQLField(
  op: Operation,
  gqlOpType: "query" | "mutation"
): Promise<{ fieldName: string; fieldArgs: string[] }> {
  const cache = await getSchemaFieldCache();
  const available = gqlOpType === "query" ? cache.query : cache.mutation;
  const byName = new Map(available.map((f) => [f.name, f.args]));

  const candidates: string[] = [];
  candidates.push(operationIdToRunStyleName(op));
  candidates.push(operationIdToGraphQLName(op));
  if (op.responseBody) candidates.push(lowerFirst(op.responseBody));
  if (op.requestBody) candidates.push(lowerFirst(op.requestBody));

  for (const candidate of candidates) {
    const args = byName.get(candidate);
    if (args) return { fieldName: candidate, fieldArgs: args };
  }

  throw new Error(
    `No GraphQL ${gqlOpType} field found for operation "${op.id}". Tried: ${candidates.join(", ")}`
  );
}

function normalizeArgsForField(
  op: Operation,
  rawArgs: Record<string, unknown>,
  expectedArgs: string[]
): Record<string, unknown> {
  const args: Record<string, unknown> = { ...rawArgs };
  const expected = new Set(expectedArgs);

  if (typeof args.parent === "string") {
    const parent = args.parent;
    const parentMatch = parent.match(/^projects\/([^/]+)\/locations\/([^/]+)$/);
    if (parentMatch) {
      if (expected.has("projectsId") && args.projectsId === undefined) {
        args.projectsId = parentMatch[1];
      }
      if (expected.has("locationsId") && args.locationsId === undefined) {
        args.locationsId = parentMatch[2];
      }
    }
  }

  if (typeof args.name === "string") {
    const captures = capturePathParams(op.flatPath, args.name);
    for (const [key, value] of Object.entries(captures)) {
      if (expected.has(key) && args[key] === undefined) {
        args[key] = value;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(args).filter(([key]) => expected.has(key))
  );
}

function capturePathParams(
  flatPath: string,
  value: string
): Record<string, string> {
  const templateParts = flatPath.split("/").filter(Boolean);
  const valueParts = value.split("/").filter(Boolean);
  if (templateParts.length !== valueParts.length) return {};

  const out: Record<string, string> = {};
  for (let i = 0; i < templateParts.length; i++) {
    const tpl = templateParts[i];
    const actual = valueParts[i];
    const match = tpl.match(/^\{(\w+)\}$/);
    if (match) {
      out[match[1]] = actual;
      continue;
    }
    if (tpl !== actual) return {};
  }
  return out;
}

function buildVarDeclarations(op: Operation, args: Record<string, unknown>): string {
  return Object.keys(args).map((key) => {
    const param = op.parameters[key];
    const gqlType = param ? discoveryTypeToGraphQL(param.type, param.required) : "String";
    return `$${key}: ${gqlType}`;
  }).join(", ");
}

function buildVarArgs(args: Record<string, unknown>): string {
  return Object.keys(args).map((key) => `${key}: $${key}`).join(", ");
}

function discoveryTypeToGraphQL(type: string, required?: boolean): string {
  const base: Record<string, string> = {
    string: "String", integer: "Int", boolean: "Boolean", number: "Float",
  };
  const gql = base[type] ?? "String";
  return required ? `${gql}!` : gql;
}

/** Default field selection so the agent gets useful data without specifying fields. */
function defaultFields(operationId: string): string {
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
  if (operationId.includes("IamPolicy"))
    return "version bindings { role members }";
  if (
    operationId.includes(".create") || operationId.includes(".patch") ||
    operationId.includes(".delete") || operationId.includes(".run") ||
    operationId.includes(".cancel")
  )
    return "name done error { code message }";
  return "name";
}