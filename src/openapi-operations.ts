/**
 * Derive searchable Operation[] from a native OpenAPI 3.x document.
 */

import type { Operation, ParameterInfo } from "./operation-types.js";

/** Minimal shape we need from OpenAPI (avoids importing full openapi-types). */
export interface OpenAPIDocLike {
  paths?: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  servers?: { url: string }[];
  security?: unknown[];
  openapi: string;
  info: { title: string; version: string };
}

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

export function operationsFromOpenAPI(doc: OpenAPIDocLike): Operation[] {
  const paths = doc.paths ?? {};
  const ops: Operation[] = [];

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const pi = pathItem as Record<string, unknown>;

    for (const method of HTTP_METHODS) {
      const op = pi[method];
      if (!op || typeof op !== "object") continue;
      const operation = op as Record<string, unknown>;

      const operationId =
        typeof operation.operationId === "string" && operation.operationId.length > 0
          ? operation.operationId
          : `${method}_${slugPath(pathKey)}`;

      const parameters = mapOpenAPIParameters(operation.parameters);
      const requestBody = extractRequestBodySchemaName(operation.requestBody);
      const responseBody = extractResponseSchemaName(operation.responses);
      const scopes = extractScopes(operation.security, doc);

      ops.push({
        id: operationId,
        method: method.toUpperCase(),
        path: pathKey.startsWith("/") ? pathKey.slice(1) : pathKey,
        flatPath: pathKey.startsWith("/") ? pathKey.slice(1) : pathKey,
        description:
          (typeof operation.summary === "string" && operation.summary) ||
          (typeof operation.description === "string" && operation.description) ||
          "",
        resource: inferResource(pathKey),
        parameters,
        scopes,
        requestBody,
        responseBody,
      });
    }
  }

  return ops;
}

function slugPath(pathKey: string): string {
  return pathKey
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function inferResource(pathKey: string): string {
  const parts = pathKey.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "api";
  const cleaned = last.replace(/\{[^}]+\}/g, "").replace(/[:]/g, "");
  return cleaned.length > 0 ? cleaned : "resource";
}

function mapOpenAPIParameters(params: unknown): Record<string, ParameterInfo> {
  const out: Record<string, ParameterInfo> = {};
  if (!Array.isArray(params)) return out;

  for (const p of params) {
    if (!p || typeof p !== "object") continue;
    const param = p as Record<string, unknown>;
    const loc = param.in;
    if (loc !== "path" && loc !== "query") continue;

    const name = String(param.name ?? "");
    if (!name) continue;

    const schema = (param.schema as Record<string, unknown>) || {};
    const type =
      typeof schema.type === "string"
        ? schema.type
        : "string";

    out[name] = {
      type,
      location: loc as "path" | "query",
      required: Boolean(param.required),
      description:
        typeof param.description === "string" ? param.description : "",
    };
  }

  return out;
}

function schemaRefToName(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const s = schema as Record<string, unknown>;
  if (typeof s.$ref !== "string") return undefined;
  const m = s.$ref.match(/#\/components\/schemas\/(.+)$/);
  return m ? m[1] : undefined;
}

function extractRequestBodySchemaName(requestBody: unknown): string | undefined {
  if (!requestBody || typeof requestBody !== "object") return undefined;
  const rb = requestBody as Record<string, unknown>;
  const content = rb.content as Record<string, unknown> | undefined;
  if (!content) return undefined;

  for (const ct of [
    "application/json",
    "application/hal+json",
    "multipart/form-data",
    "application/x-www-form-urlencoded",
  ]) {
    const media = content[ct] as Record<string, unknown> | undefined;
    if (!media?.schema) continue;
    const name = schemaRefToName(media.schema);
    if (name) return name;
  }
  return undefined;
}

function extractResponseSchemaName(responses: unknown): string | undefined {
  if (!responses || typeof responses !== "object") return undefined;
  const r = responses as Record<string, unknown>;

  for (const code of ["200", "201", "202", "204", "default"]) {
    const resp = r[code];
    if (!resp || typeof resp !== "object") continue;
    const content = (resp as Record<string, unknown>).content as
      | Record<string, unknown>
      | undefined;
    if (!content) continue;

    for (const ct of [
      "application/json",
      "application/hal+json",
      "*/*",
      "application/octet-stream",
    ]) {
      const media = content[ct] as Record<string, unknown> | undefined;
      if (!media?.schema) continue;
      const name = schemaRefToName(media.schema);
      if (name) return name;
    }
  }
  return undefined;
}

function extractScopes(
  operationSecurity: unknown,
  doc: OpenAPIDocLike
): string[] {
  const scopes = new Set<string>();
  const collect = (sec: unknown) => {
    if (!Array.isArray(sec)) return;
    for (const item of sec) {
      if (!item || typeof item !== "object") continue;
      for (const [name, arr] of Object.entries(item)) {
        if (Array.isArray(arr)) {
          for (const s of arr) {
            if (typeof s === "string") scopes.add(s);
          }
        } else if (name && !scopes.size) {
          scopes.add(name);
        }
      }
    }
  };
  collect(operationSecurity);
  if (scopes.size === 0) collect(doc.security);
  return [...scopes];
}
