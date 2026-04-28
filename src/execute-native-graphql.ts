/**
 * Execute a native GraphQL root field via HTTP POST (spec introspection + runtime fetch).
 */

import fetch from "node-fetch";
import type { Operation } from "./operation-types.js";
import { mergedAuthHeaders } from "./auth-headers.js";
import { recordNativeGraphqlExecute } from "./native-protocol-metrics.js";
import { getGraphQLSource } from "./native-protocol-registry.js";

export async function executeNativeGraphQL(
  op: Operation,
  args: Record<string, unknown>,
  selectionSet: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const meta = op.nativeGraphQL;
  if (!meta) {
    const r = { ok: false as const, error: "Internal error: missing nativeGraphQL metadata" };
    recordNativeGraphqlExecute(false);
    return r;
  }
  const src = getGraphQLSource(meta.sourceLabel);
  if (!src) {
    const r = { ok: false as const, error: `Unknown GraphQL source: ${meta.sourceLabel}` };
    recordNativeGraphqlExecute(false);
    return r;
  }

  const headers = {
    ...mergedAuthHeaders(meta.sourceLabel),
    ...src.headers,
  };

  const fieldName = meta.fieldName;
  const kind = meta.operationType === "mutation" ? "mutation" : "query";
  const paramEntries = Object.entries(op.parameters);

  for (const [name, info] of paramEntries) {
    if (info.required && args[name] === undefined) {
      const r = { ok: false as const, error: `Missing required GraphQL argument: ${name}` };
      recordNativeGraphqlExecute(false);
      return r;
    }
  }

  const varDecls = paramEntries.map(([name, info]) => `$${name}: ${info.type}`).join(", ");
  const varPass = paramEntries.map(([name]) => `${name}: $${name}`).join(", ");
  const varSection = paramEntries.length ? `(${varDecls})` : "";
  const argsSection = paramEntries.length ? `(${varPass})` : "";

  const query = `${kind} Exec${varSection} { ${fieldName}${argsSection} { ${selectionSet} } }`;

  const variables: Record<string, unknown> = {};
  for (const [name] of paramEntries) {
    if (args[name] !== undefined) variables[name] = args[name];
  }

  const body: Record<string, unknown> = { query };
  if (Object.keys(variables).length > 0) body.variables = variables;

  const res = await fetch(src.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  };

  if (!res.ok) {
    const r = {
      ok: false as const,
      error: `GraphQL HTTP ${res.status}: ${JSON.stringify(json)}`,
    };
    recordNativeGraphqlExecute(false);
    return r;
  }
  if (json.errors?.length) {
    const r = {
      ok: false as const,
      error: json.errors.map((e) => e.message ?? JSON.stringify(e)).join("; "),
    };
    recordNativeGraphqlExecute(false);
    return r;
  }

  recordNativeGraphqlExecute(true);
  return { ok: true, data: json.data };
}
