/**
 * tools.ts
 *
 * Two tools: search (spec discovery) and execute (GraphQL-backed REST call).
 * GraphQL field names are resolved via schema introspection — see resolveGraphQLField.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { sanitizeNameForGraphQL } from "@graphql-mesh/utils";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPackageRoot } from "./package-root.js";
import { resolveBundledProvider } from "./provider-registry.js";
import {
  buildVarArgs,
  buildVarDeclarations,
  capturePathParams,
  discoveryTypeToGraphQL,
  lowerFirst,
  normalizeArgsForField,
  operationIdToGraphQLName,
  operationIdToRunStyleName,
} from "./graphql-execute-helpers.js";
import { loadSpec, resolveApiBaseUrl } from "./spec-loader.js";
import { searchOperations, formatSearchResults } from "./spec-search.js";
import { createGraphQLClient } from "./graphql-client.js";
import { executeRestOperation } from "./rest-operation.js";
import type { Operation } from "./spec-loader.js";
import { INLINE_OPENAPI_REQUEST_BODY } from "./operation-types.js";

const gql = createGraphQLClient();
type GraphQLFieldInfo = { name: string; args: string[] };
let schemaFieldCachePromise: Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
}> | null = null;

/** Clear cached GraphQL field names (e.g. after changing CLAWQL_PROVIDER / spec). */
export function resetSchemaFieldCache(): void {
  schemaFieldCachePromise = null;
}

/**
 * On MCP startup: if `CLAWQL_INTROSPECTION_PATH` or bundled `introspection.json` exists,
 * load it so the first `execute` never hits the GraphQL proxy for field-name introspection.
 * Returns whether disk cache was applied.
 */
export async function preloadSchemaFieldCacheFromDisk(): Promise<boolean> {
  const spec = await loadSpec();
  if (spec.multi) {
    console.error(
      "[tools] Multi-spec mode: skipping GraphQL introspection cache (execute uses REST)."
    );
    return false;
  }
  const parsed = await tryLoadIntrospectionFromDisk();
  if (!parsed) return false;
  schemaFieldCachePromise = Promise.resolve(parsed);
  return true;
}

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
      const loaded = await loadSpec();
      const { operations, openapi, openapis, multi } = loaded;
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

      const openapiForOp =
        multi && openapis?.length
          ? openapis[op.specIndex ?? 0]
          : openapi;

      if (multi) {
        const fallback = await executeRestOperation(op, args, openapiForOp);
        if (!fallback.ok) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: fallback.error,
                specLabel: op.specLabel ?? null,
                hint: "Multi-spec mode uses REST only (no GraphQL). Check path/query/body args.",
              }),
            }],
          };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(fallback.data, null, 2),
          }],
        };
      }

      try {
        const isGet = op.method === "GET";
        const gqlOpType = isGet ? "query" : "mutation";
        const { fieldName, fieldArgs } = await resolveGraphQLField(op, gqlOpType);
        const normalizedArgs = normalizeArgsForField(op, args, fieldArgs);
        const selectedFields = fields?.length
          ? fields.join("\n        ")
          : defaultFields(operationId);

        const varDecls = buildVarDeclarations(op, normalizedArgs);
        const varArgs = buildVarArgs(normalizedArgs);
        const header =
          varDecls.trim().length > 0
            ? `${gqlOpType} Execute(${varDecls})`
            : `${gqlOpType} Execute`;
        const fieldCall =
          varArgs.trim().length > 0 ? `${fieldName}(${varArgs})` : fieldName;

        const gqlDocument = `
          ${header} {
            ${fieldCall} {
              ${selectedFields}
            }
          }
        `;

        const data = await gql.query<Record<string, unknown>>(gqlDocument, normalizedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(data[fieldName], null, 2) }],
        };
      } catch (err: unknown) {
        const fallback = await executeRestOperation(op, args, openapiForOp);
        if (!fallback.ok) {
          const reason = err instanceof Error ? err.message : String(err);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: reason,
                fallbackError: fallback.error,
                hint: "GraphQL execution failed and REST fallback also failed.",
              }),
            }],
          };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(fallback.data, null, 2),
          }],
        };
      }
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function resolveIntrospectionFilePath(): string | null {
  const explicit = process.env.CLAWQL_INTROSPECTION_PATH?.trim();
  if (explicit) {
    return isAbsolute(explicit)
      ? explicit
      : resolvePath(process.cwd(), explicit);
  }
  const prov = process.env.CLAWQL_PROVIDER?.trim();
  if (prov) {
    const p = resolveBundledProvider(prov);
    if (p?.bundledIntrospectionPath) {
      return resolvePath(getPackageRoot(), p.bundledIntrospectionPath);
    }
  }
  return null;
}

async function tryLoadIntrospectionFromDisk(): Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
} | null> {
  const introPath = resolveIntrospectionFilePath();
  if (!introPath) return null;
  try {
    const text = await readFile(introPath, "utf-8");
    const data = JSON.parse(text) as {
      __schema: {
        queryType: {
          fields: Array<{ name: string; args: Array<{ name: string }> }>;
        };
        mutationType: {
          fields: Array<{ name: string; args: Array<{ name: string }> }>;
        } | null;
      };
    };
    console.error(
      `[tools] Using pregenerated GraphQL introspection (disk): ${introPath}`
    );
    return {
      query: data.__schema.queryType.fields.map((f) => ({
        name: f.name,
        args: f.args.map((a) => a.name),
      })),
      mutation: (data.__schema.mutationType?.fields ?? []).map((f) => ({
        name: f.name,
        args: f.args.map((a) => a.name),
      })),
    };
  } catch {
    return null;
  }
}

async function getSchemaFieldCache(): Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
}> {
  if (!schemaFieldCachePromise) {
    schemaFieldCachePromise = (async (): Promise<{
      query: GraphQLFieldInfo[];
      mutation: GraphQLFieldInfo[];
    }> => {
      // 1) Pregenerated file (CLAWQL_INTROSPECTION_PATH or bundled path for CLAWQL_PROVIDER)
      const fromDisk = await tryLoadIntrospectionFromDisk();
      if (fromDisk) return fromDisk;
      // 2) Live introspection against graphql-proxy (requires OpenAPI→GraphQL build)
      const data = await gql.query<{
        __schema: {
          queryType: {
            fields: Array<{ name: string; args: Array<{ name: string }> }>;
          };
          mutationType: {
            fields: Array<{ name: string; args: Array<{ name: string }> }>;
          } | null;
        };
      }>(`
      query IntrospectRootFields {
        __schema {
          queryType { fields { name args { name } } }
          mutationType { fields { name args { name } } }
        }
      }
    `);
      return {
        query: data.__schema.queryType.fields.map((f) => ({
          name: f.name,
          args: f.args.map((a) => a.name),
        })),
        mutation: (data.__schema.mutationType?.fields ?? []).map((f) => ({
          name: f.name,
          args: f.args.map((a) => a.name),
        })),
      };
    })();
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
  // Omnigraph / GraphQL Mesh OpenAPI handler: field names from operationId
  candidates.push(sanitizeNameForGraphQL(op.id));
  candidates.push(operationIdToRunStyleName(op));
  candidates.push(operationIdToGraphQLName(op));
  if (op.responseBody) candidates.push(lowerFirst(op.responseBody));
  if (
    op.requestBody &&
    op.requestBody !== INLINE_OPENAPI_REQUEST_BODY
  ) {
    candidates.push(lowerFirst(op.requestBody));
  }

  for (const candidate of candidates) {
    const args = byName.get(candidate);
    if (args) return { fieldName: candidate, fieldArgs: args };
  }

  throw new Error(
    `No GraphQL ${gqlOpType} field found for operation "${op.id}". Tried: ${candidates.join(", ")}`
  );
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

// Narrow test surface for critical path helper behavior.
export const __testUtils = {
  operationIdToGraphQLName,
  operationIdToRunStyleName,
  normalizeArgsForField,
  capturePathParams,
  buildVarDeclarations,
  buildVarArgs,
  discoveryTypeToGraphQL,
  defaultFields,
};