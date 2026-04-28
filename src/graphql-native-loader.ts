/**
 * Load native GraphQL operations via HTTP introspection, saved introspection JSON, or SDL on disk.
 */

import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { GraphQLArgument, GraphQLSchema, IntrospectionQuery } from "graphql";
import { buildClientSchema, buildSchema, getIntrospectionQuery, isNonNullType } from "graphql";
import fetch from "node-fetch";
import type { Operation, ParameterInfo } from "./operation-types.js";
import { mergedAuthHeaders } from "./auth-headers.js";
import { normalizeOperationId } from "./spec-kind.js";
import type { GraphQLSourceConfig } from "./native-protocol-env.js";
import { parseGraphQLSourcesEnv } from "./native-protocol-env.js";
import { registerGraphQLSource } from "./native-protocol-registry.js";

function graphQLArgsToParameters(args: readonly GraphQLArgument[]): Record<string, ParameterInfo> {
  const out: Record<string, ParameterInfo> = {};
  for (const a of args) {
    out[a.name] = {
      type: String(a.type),
      location: "query",
      required: isNonNullType(a.type),
      description: a.description ?? "",
    };
  }
  return out;
}

async function introspectRemote(
  endpoint: string,
  headers: Record<string, string>
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      query: getIntrospectionQuery({ descriptions: true }),
    }),
  });
  if (!res.ok) {
    throw new Error(`GraphQL introspection HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: unknown;
    errors?: unknown;
  };
  if (json.errors) {
    throw new Error(`GraphQL introspection errors: ${JSON.stringify(json.errors)}`);
  }
  if (!json.data) {
    throw new Error("GraphQL introspection: missing data");
  }
  return json.data;
}

/** Accept `GET /graphql`-style `{ data: { __schema } }` or a bare IntrospectionQuery `{ __schema }`. */
export function introspectionJsonToQuery(raw: unknown): IntrospectionQuery {
  if (!raw || typeof raw !== "object") {
    throw new Error("introspection JSON: expected an object");
  }
  const o = raw as Record<string, unknown>;
  if (o.data && typeof o.data === "object" && o.data !== null && "__schema" in (o.data as object)) {
    return o.data as IntrospectionQuery;
  }
  if ("__schema" in o) {
    return raw as IntrospectionQuery;
  }
  throw new Error(
    "introspection JSON: expected `data.__schema` (HTTP introspection body) or root `__schema`"
  );
}

function operationsFromSchema(label: string, schema: GraphQLSchema): Operation[] {
  const ops: Operation[] = [];

  // Subscription type fields are not added to the MCP index (subscriptions unsupported over MCP stdio; ADR #190).

  const queryType = schema.getQueryType();
  if (queryType) {
    for (const fieldName of Object.keys(queryType.getFields())) {
      if (fieldName.startsWith("__")) continue;
      const field = queryType.getFields()[fieldName];
      const segment = `Query.${fieldName}`;
      ops.push({
        id: normalizeOperationId("graphql", label, segment),
        method: "QUERY",
        path: `graphql/${label}/query/${fieldName}`,
        flatPath: `graphql/${label}/query/${fieldName}`,
        description: field.description ?? `GraphQL Query.${fieldName}`,
        resource: fieldName,
        parameters: graphQLArgsToParameters(field.args),
        scopes: [],
        protocolKind: "graphql",
        specLabel: label,
        nativeGraphQL: {
          sourceLabel: label,
          operationType: "query",
          fieldName,
        },
      });
    }
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    for (const fieldName of Object.keys(mutationType.getFields())) {
      if (fieldName.startsWith("__")) continue;
      const field = mutationType.getFields()[fieldName];
      const segment = `Mutation.${fieldName}`;
      ops.push({
        id: normalizeOperationId("graphql", label, segment),
        method: "MUTATION",
        path: `graphql/${label}/mutation/${fieldName}`,
        flatPath: `graphql/${label}/mutation/${fieldName}`,
        description: field.description ?? `GraphQL Mutation.${fieldName}`,
        resource: fieldName,
        parameters: graphQLArgsToParameters(field.args),
        scopes: [],
        protocolKind: "graphql",
        specLabel: label,
        nativeGraphQL: {
          sourceLabel: label,
          operationType: "mutation",
          fieldName,
        },
      });
    }
  }

  return ops;
}

async function loadOne(cfg: GraphQLSourceConfig): Promise<Operation[]> {
  const label = cfg.name;

  if (cfg.introspectionPath && (cfg.schemaPath || cfg.schemaContent)) {
    console.error(
      `[native-protocol] GraphQL "${label}": using introspectionPath (${cfg.introspectionPath}); ignoring other schema hints`
    );
  }

  let schema: GraphQLSchema;

  if (cfg.introspectionPath) {
    const abs = resolvePath(process.cwd(), cfg.introspectionPath);
    const text = await readFile(abs, "utf-8");
    schema = buildClientSchema(introspectionJsonToQuery(JSON.parse(text) as unknown));
  } else if (cfg.schemaPath) {
    const abs = resolvePath(process.cwd(), cfg.schemaPath);
    const text = await readFile(abs, "utf-8");
    schema = buildSchema(text);
  } else if (cfg.schemaContent?.trim()) {
    schema = buildSchema(cfg.schemaContent);
  } else {
    const headerMerge = {
      ...mergedAuthHeaders(label),
      ...(cfg.headers ?? {}),
    };
    const introspectionData = await introspectRemote(cfg.endpoint, headerMerge);
    schema = buildClientSchema(introspectionData as IntrospectionQuery);
  }

  registerGraphQLSource(label, cfg.endpoint, cfg.headers ?? {});
  return operationsFromSchema(label, schema);
}

/** Exported for tests with injected configs. */
export async function loadGraphqlNativeOperationsFromConfigs(
  configs: GraphQLSourceConfig[]
): Promise<Operation[]> {
  const out: Operation[] = [];
  for (const cfg of configs) {
    try {
      out.push(...(await loadOne(cfg)));
    } catch (e: unknown) {
      console.error(`[native-protocol] GraphQL source "${cfg.name}" failed:`, e);
    }
  }
  return out;
}

export async function loadGraphqlNativeOperations(): Promise<Operation[]> {
  return loadGraphqlNativeOperationsFromConfigs(parseGraphQLSourcesEnv());
}
