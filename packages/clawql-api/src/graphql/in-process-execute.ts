/**
 * Run a single OpenAPI-backed GraphQL operation in-process (no HTTP proxy).
 */

import { execute, parse } from "graphql";
import type { Operation } from "../spec/operation-types.js";
import {
  buildVarArgs,
  buildVarDeclarations,
  normalizeArgsForField,
  resolveGraphQLFieldFromSchema,
} from "./execute-helpers.js";
import { buildGraphQLSchema } from "./schema-builder.js";
import { Effect } from "effect";

export type InProcessGraphQLResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Execute the GraphQL field that maps to `op`, with the same document shape as MCP `execute`.
 */
async function executeOperationGraphQLImpl(
  openapi: object,
  baseUrl: string,
  op: Operation,
  rawArgs: Record<string, unknown>,
  fieldsSelectionString: string
): Promise<InProcessGraphQLResult>  {
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
    ({ fieldName, fieldArgs } = resolveGraphQLFieldFromSchema(schema, op, gqlOpType));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const normalizedArgs = normalizeArgsForField(op, rawArgs, fieldArgs);
  const varDecls = buildVarDeclarations(op, normalizedArgs);
  const varArgs = buildVarArgs(normalizedArgs);
  const header =
    varDecls.trim().length > 0 ? `${gqlOpType} Execute(${varDecls})` : `${gqlOpType} Execute`;
  const fieldCall = varArgs.trim().length > 0 ? `${fieldName}(${varArgs})` : fieldName;

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

export function executeOperationGraphQLEffect(
  openapi: object,
  baseUrl: string,
  op: Operation,
  rawArgs: Record<string, unknown>,
  fieldsSelectionString: string
): Effect.Effect<InProcessGraphQLResult, Error> {
  return Effect.tryPromise({
    try: () => executeOperationGraphQLImpl(openapi, baseUrl, op, rawArgs, fieldsSelectionString),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link executeOperationGraphQLEffect} for Effect callers. */
export async function executeOperationGraphQL(
  openapi: object,
  baseUrl: string,
  op: Operation,
  rawArgs: Record<string, unknown>,
  fieldsSelectionString: string
): Promise<InProcessGraphQLResult>  {
  return Effect.runPromise(executeOperationGraphQLEffect(openapi, baseUrl, op, rawArgs, fieldsSelectionString));
}
