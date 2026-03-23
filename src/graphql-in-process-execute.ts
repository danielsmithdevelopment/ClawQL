/**
 * Run a single OpenAPI-backed GraphQL operation in-process (no HTTP proxy).
 * Used by token benchmarks to capture real JSON payloads.
 */

import { execute, parse } from "graphql";
import type { Operation } from "./spec-loader.js";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";
import {
  buildVarArgs,
  buildVarDeclarations,
  normalizeArgsForField,
  resolveGraphQLFieldFromSchema,
} from "./graphql-execute-helpers.js";

export type InProcessGraphQLResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/**
 * Execute the GraphQL field that maps to `op`, with the same document shape as MCP `execute`.
 */
export async function executeOperationGraphQL(
  openapi: object,
  baseUrl: string,
  op: Operation,
  rawArgs: Record<string, unknown>,
  fieldsSelectionString: string
): Promise<InProcessGraphQLResult> {
  let schema: import("graphql").GraphQLSchema;
  try {
    const built = await buildGraphQLSchema(openapi, baseUrl);
    schema = built.schema;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const gqlOpType = op.method === "GET" ? "query" : "mutation";
  let fieldName: string;
  let fieldArgs: string[];
  try {
    ({ fieldName, fieldArgs } = resolveGraphQLFieldFromSchema(
      schema,
      op,
      gqlOpType
    ));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const normalizedArgs = normalizeArgsForField(op, rawArgs, fieldArgs);
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
        ${fieldsSelectionString}
      }
    }
  `;

  const result = await execute({
    schema,
    document: parse(gqlDocument),
    variableValues: normalizedArgs,
    contextValue: {},
  });

  if (result.errors?.length) {
    return {
      ok: false,
      error: result.errors.map((e) => e.message).join("; "),
    };
  }

  const rootData =
    result.data && typeof result.data === "object" && result.data !== null
      ? (result.data as Record<string, unknown>)[fieldName]
      : undefined;

  return { ok: true, data: rootData };
}
