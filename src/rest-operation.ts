/**
 * Direct REST execution against an OpenAPI operation (same URL building as MCP `execute` fallback).
 * Exported for benchmarks comparing full REST response bodies vs GraphQL-shaped responses.
 */

import { Buffer } from "node:buffer";
import baseFetch from "node-fetch";
import type { RequestInit as FetchRequestInit, Response } from "node-fetch";
import { mergedAuthHeaders } from "./auth-headers.js";
import { resolveApiBaseUrlForOperation, type OpenAPIDoc } from "./spec-loader.js";
import type { Operation } from "./spec-loader.js";

export { mergedAuthHeaders };

/**
 * When **`CLAWQL_TEST_SLACK_FETCH_STUB=1`**, `executeRestOperation` does not open a real socket.
 * Used by **`src/server.test.ts`** stdio `callTool("notify")` coverage (#136).
 *
 * **`CLAWQL_TEST_SLACK_FETCH_BODY`**: optional full JSON response text (default: minimal `ok:true` Slack shape).
 * **`CLAWQL_TEST_SLACK_FETCH_HTTP_OK=0`**: return **`res.ok === false`** (HTTP error path).
 */
function createTestSlackFetch(): typeof baseFetch {
  return (async (_url: string | URL, _init?: FetchRequestInit) => {
    const raw = process.env.CLAWQL_TEST_SLACK_FETCH_BODY?.trim();
    const text =
      raw && raw.length > 0
        ? raw
        : '{"ok":true,"channel":"C_STUB","ts":"1.0","message":{"text":"stub"}}';
    const httpOk = process.env.CLAWQL_TEST_SLACK_FETCH_HTTP_OK !== "0";
    return {
      ok: httpOk,
      status: httpOk ? 200 : 500,
      text: async () => text,
    } as Response;
  }) as typeof baseFetch;
}

/**
 * When **`CLAWQL_TEST_ONYX_FETCH_STUB=1`**, `executeRestOperation` does not open a real socket.
 * Used by **`src/server.test.ts`** stdio `callTool("knowledge_search_onyx")` coverage (#144).
 *
 * **`CLAWQL_TEST_ONYX_FETCH_BODY`**: optional full JSON response text (default: minimal search-shaped stub).
 * **`CLAWQL_TEST_ONYX_FETCH_HTTP_OK=0`**: return **`res.ok === false`** (HTTP error path).
 */
function createTestOnyxFetch(): typeof baseFetch {
  return (async (_url: string | URL, _init?: FetchRequestInit) => {
    const raw = process.env.CLAWQL_TEST_ONYX_FETCH_BODY?.trim();
    const text = raw && raw.length > 0 ? raw : '{"query":"stub","documents":[]}';
    const httpOk = process.env.CLAWQL_TEST_ONYX_FETCH_HTTP_OK !== "0";
    return {
      ok: httpOk,
      status: httpOk ? 200 : 500,
      text: async () => text,
    } as Response;
  }) as typeof baseFetch;
}

/** Test stubs are resolved per request so Vitest `beforeEach` env wins over module-init order. */
function getFetchImplForRest(): typeof baseFetch {
  if (process.env.CLAWQL_TEST_SLACK_FETCH_STUB === "1") return createTestSlackFetch();
  if (process.env.CLAWQL_TEST_ONYX_FETCH_STUB === "1") return createTestOnyxFetch();
  return baseFetch;
}

/** Build JSON body: drop path/query args so `owner`/`repo` are not sent in PATCH/POST bodies. */
/** Suffixes on execute args: `file` + `fileFileName` → filename for multipart, not a separate part. */
const MULTIPART_FILE_META_SUFFIX = /(FileName|Filename)$/;

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

function appendMultipartValue(
  fd: FormData,
  key: string,
  v: unknown,
  all: Record<string, unknown>
): void {
  if (v === undefined || v === null) return;

  if (globalThis.Blob && v instanceof Blob) {
    const fromFile = globalThis.File && v instanceof File;
    if (fromFile) {
      fd.append(key, v);
      return;
    }
    const name =
      (typeof all[`${key}FileName`] === "string" && (all[`${key}FileName`] as string).trim()) ||
      (typeof all[`${key}Filename`] === "string" && (all[`${key}Filename`] as string).trim()) ||
      `${key}.bin`;
    fd.append(key, v, name);
    return;
  }

  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    const buf = Buffer.isBuffer(v) ? v : Buffer.from(v);
    const name =
      (typeof all[`${key}FileName`] === "string" && (all[`${key}FileName`] as string).trim()) ||
      (typeof all[`${key}Filename`] === "string" && (all[`${key}Filename`] as string).trim()) ||
      `${key}.bin`;
    // Copy into a fresh ArrayBuffer so `Blob` typing accepts the part (Node `Buffer` uses ArrayBufferLike).
    const part: BlobPart = new Uint8Array(Uint8Array.from(buf));
    fd.append(key, new Blob([part]), name);
    return;
  }

  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    fd.append(key, String(v));
  } else if (typeof v === "object") {
    fd.append(key, JSON.stringify(v));
  }
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
    baseUrl = resolveApiBaseUrlForOperation(openapi, op);
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
  const wantsBinary =
    op.requestBodyContentType === "multipart/form-data" ||
    op.requestBodyContentType === "application/octet-stream" ||
    op.requestBodyContentType === "application/pdf" ||
    op.requestBodyContentType === "application/x-www-form-urlencoded";
  const headers: Record<string, string> = {
    Accept: wantsBinary ? "*/*" : "application/json",
    ...mergedAuthHeaders(op.specLabel),
  };
  const init: FetchRequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD" && op.requestBody) {
    const ct = op.requestBodyContentType?.toLowerCase();
    if (ct === "multipart/form-data" && typeof FormData !== "undefined") {
      const fd = new FormData();
      const bodyObj = buildRestRequestBodyFromArgs(op, args);
      for (const [k, v] of Object.entries(bodyObj)) {
        if (v === undefined || v === null) continue;
        if (MULTIPART_FILE_META_SUFFIX.test(k)) continue;
        appendMultipartValue(fd, k, v, args);
      }
      init.body = fd as never;
    } else if (ct === "application/x-www-form-urlencoded") {
      const bodyObj = buildRestRequestBodyFromArgs(op, args);
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(bodyObj)) {
        if (v === undefined || v === null) continue;
        sp.set(k, String(v));
      }
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = sp.toString();
    } else if (ct === "application/octet-stream") {
      const raw = args.body;
      if (Buffer.isBuffer(raw)) {
        init.body = raw as never;
      } else if (raw instanceof Uint8Array) {
        init.body = Buffer.from(raw) as never;
      } else if (typeof raw === "string") {
        init.body = Buffer.from(raw, "utf8") as never;
      } else {
        return {
          ok: false,
          error:
            "application/octet-stream requires execute args.body as string, Buffer, or Uint8Array",
        };
      }
      headers["Content-Type"] = "application/octet-stream";
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(buildRestRequestBodyFromArgs(op, args));
    }
  }

  try {
    const res = await getFetchImplForRest()(url.toString(), init);
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
