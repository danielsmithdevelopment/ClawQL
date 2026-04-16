/**
 * Direct REST execution against an OpenAPI operation (same URL building as MCP `execute` fallback).
 * Exported for benchmarks comparing full REST response bodies vs GraphQL-shaped responses.
 */

import fetch from "node-fetch";
import type { RequestInit as FetchRequestInit } from "node-fetch";
import { mergedAuthHeaders } from "./auth-headers.js";
import { resolveApiBaseUrl, type OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./spec-loader.js";

export { mergedAuthHeaders };

/** Build JSON body: drop path/query args so `owner`/`repo` are not sent in PATCH/POST bodies. */
export function buildRestRequestBodyFromArgs(
  op: Operation,
  args: Record<string, unknown>
): Record<string, unknown> {
  const pathTemplate = op.path?.includes("{+") ? op.path : op.flatPath;
  const exclude = new Set<string>();
  for (const m of pathTemplate.matchAll(/\{[+]?(\w+)\}/g)) {
    exclude.add(m[1]);
  }
  for (const [name, p] of Object.entries(op.parameters)) {
    if (p.location === "path" || p.location === "query") exclude.add(name);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (exclude.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export function renderPath(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{[+]?(\w+)\}/g, (_m, name: string) => {
    const v = args[name];
    if (v === undefined || v === null) return `{${name}}`;
    return encodeURIComponent(String(v));
  });
}

/**
 * Perform the HTTP call for `op` with `args` (path + query + JSON body for non-GET with body).
 */
export async function executeRestOperation(
  op: Operation,
  args: Record<string, unknown>,
  openapi: OpenAPIDoc
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  let baseUrl: string;
  try {
    baseUrl = resolveApiBaseUrl(openapi);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const pathTemplate = op.path?.includes("{+") ? op.path : op.flatPath;
  const path = renderPath(pathTemplate, args).replace(/^\//, "");
  const pathParamNames = new Set<string>();
  for (const m of pathTemplate.matchAll(/\{[+]?(\w+)\}/g)) {
    pathParamNames.add(m[1]);
  }

  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${path}`);
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    if (pathParamNames.has(k)) continue;
    const p = op.parameters[k];
    if (p?.location === "path") continue;
    url.searchParams.append(k, String(v));
  }

  const method = op.method.toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...mergedAuthHeaders(op.specLabel),
  };
  const init: FetchRequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD" && op.requestBody) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(buildRestRequestBodyFromArgs(op, args));
  }

  try {
    const res = await fetch(url.toString(), init);
    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep text payload
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `REST HTTP ${res.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`,
      };
    }
    return { ok: true, data: payload };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
