/**
 * Direct REST execution against an OpenAPI operation (same URL building as MCP `execute` fallback).
 * Exported for benchmarks comparing full REST response bodies vs GraphQL-shaped responses.
 */

import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";
import { Effect } from "effect";
import baseFetch from "node-fetch";
import type { RequestInit as FetchRequestInit, Response } from "node-fetch";
import { mergedAuthHeadersEffect } from "../auth/auth-headers.js";
import { isAwsSpecLabelEffect } from "../auth/aws-auth.js";
import { maybeSignAwsRequestEffect, normalizeAwsExecuteUrlEffect } from "../auth/aws-sigv4.js";
import type { Operation } from "../spec/operation-types.js";
import { resolveApiBaseUrlForOperation, type OpenAPIDoc } from "../spec/spec-loader.js";
import {
  beginUpstreamClientPhase,
  classifyUpstreamPhase,
  formatUpstreamPhaseLog,
  runWithUpstreamClientPhase,
  upstreamPhaseEnabled,
} from "./upstream-client-phase.js";

/** Env flag reader — Effect so domain config stays on the Effect surface. */
const envTruthyEffect = (name: string): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const v = (process.env[name] ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  });

const upstreamFetchSlowMsEffect = (): Effect.Effect<number> =>
  Effect.sync(() => {
    const n = Number.parseInt(process.env.CLAWQL_UPSTREAM_FETCH_SLOW_MS ?? "5", 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
  });

/** Minimal fetch surface shared by node-fetch and native undici/Bun fetch. */
type RestFetchResponse = {
  ok: boolean;
  status: number;
  headers?: { get?: (name: string) => string | null };
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};
type RestFetch = (url: string | URL, init?: FetchRequestInit) => Promise<RestFetchResponse>;

/** Outbound TCP connects created by our keep-alive agents (node-fetch path only). */
let outboundTcpConnects = 0;
let httpKeepAliveAgent: http.Agent | undefined;
let httpsKeepAliveAgent: https.Agent | undefined;

const ensureKeepAliveAgentsEffect = (): Effect.Effect<void> =>
  Effect.sync(() => {
    if (httpKeepAliveAgent && httpsKeepAliveAgent) return;
    const wrapHttp = (agent: http.Agent): http.Agent => {
      const orig = agent.createConnection.bind(agent);
      agent.createConnection = (options, callback) => {
        outboundTcpConnects += 1;
        return orig(options, callback);
      };
      return agent;
    };
    const wrapHttps = (agent: https.Agent): https.Agent => {
      const orig = agent.createConnection.bind(agent);
      agent.createConnection = (options, callback) => {
        outboundTcpConnects += 1;
        return orig(options, callback);
      };
      return agent;
    };
    httpKeepAliveAgent = wrapHttp(new http.Agent({ keepAlive: true, maxSockets: 64 }));
    httpsKeepAliveAgent = wrapHttps(new https.Agent({ keepAlive: true, maxSockets: 64 }));
  });

const outboundTcpConnectsEffect = (): Effect.Effect<number> =>
  Effect.sync(() => outboundTcpConnects);

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

/**
 * Test stubs are resolved per request so Vitest `beforeEach` env wins over module-init order.
 * When **both** Slack and Onyx stubs are enabled (OpenBench `idp-safe-pipeline-lite`),
 * dispatch by hostname so neither stub shadows the other.
 *
 * Production backends (env, Effect-gated):
 * - default: `node-fetch` (no agent — historically one TCP connect per request)
 * - `CLAWQL_UPSTREAM_KEEPALIVE=1`: `node-fetch` + shared keep-alive `http(s).Agent`
 * - `CLAWQL_NATIVE_FETCH=1`: runtime `globalThis.fetch` (Node undici / Bun — pools by default)
 */
function getFetchImplForRestEffect(): Effect.Effect<{
  fetch: RestFetch;
  backend: "stub" | "node-fetch" | "node-fetch+keepalive" | "native";
}> {
  return Effect.gen(function* () {
    const slack = yield* envTruthyEffect("CLAWQL_TEST_SLACK_FETCH_STUB");
    const onyx = yield* envTruthyEffect("CLAWQL_TEST_ONYX_FETCH_STUB");
    if (slack && onyx) {
      const slackFetch = createTestSlackFetch();
      const onyxFetch = createTestOnyxFetch();
      return {
        backend: "stub" as const,
        fetch: ((url: string | URL, init?: FetchRequestInit) => {
          let host: string;
          try {
            host = new URL(String(url)).hostname.toLowerCase();
          } catch {
            host = "";
          }
          if (host === "slack.com" || host.endsWith(".slack.com")) {
            return slackFetch(url, init);
          }
          return onyxFetch(url, init);
        }) as RestFetch,
      };
    }
    if (slack) {
      return { backend: "stub" as const, fetch: createTestSlackFetch() as RestFetch };
    }
    if (onyx) {
      return { backend: "stub" as const, fetch: createTestOnyxFetch() as RestFetch };
    }

    const native = yield* envTruthyEffect("CLAWQL_NATIVE_FETCH");
    if (native && typeof globalThis.fetch === "function") {
      return {
        backend: "native" as const,
        fetch: ((url: string | URL, init?: FetchRequestInit) =>
          globalThis.fetch(String(url), init as RequestInit)) as RestFetch,
      };
    }

    const keepalive = yield* envTruthyEffect("CLAWQL_UPSTREAM_KEEPALIVE");
    if (keepalive) {
      yield* ensureKeepAliveAgentsEffect();
      return {
        backend: "node-fetch+keepalive" as const,
        fetch: ((url: string | URL, init?: FetchRequestInit) => {
          const u = new URL(String(url));
          const agent = u.protocol === "https:" ? httpsKeepAliveAgent : httpKeepAliveAgent;
          return baseFetch(url, { ...init, agent: agent as never });
        }) as RestFetch,
      };
    }

    return { backend: "node-fetch" as const, fetch: baseFetch as RestFetch };
  });
}

/** Build JSON body: drop path/query args so `owner`/`repo` are not sent in PATCH/POST bodies. */
/** Suffixes on execute args: `file` + `fileFileName` / `fileEncoding` → metadata for multipart, not separate parts. */
const MULTIPART_FILE_META_SUFFIX = /(FileName|Filename|Encoding)$/;

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

  if (typeof v === "string") {
    const enc =
      typeof all[`${key}Encoding`] === "string"
        ? String(all[`${key}Encoding`]).trim().toLowerCase()
        : "";
    if (enc === "base64") {
      const buf = Buffer.from(v, "base64");
      const name =
        (typeof all[`${key}FileName`] === "string" && (all[`${key}FileName`] as string).trim()) ||
        (typeof all[`${key}Filename`] === "string" && (all[`${key}Filename`] as string).trim()) ||
        `${key}.bin`;
      const part: BlobPart = new Uint8Array(Uint8Array.from(buf));
      fd.append(key, new Blob([part]), name);
      return;
    }
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
async function executeRestOperationImpl(
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
    if (p?.location !== "query") continue;
    url.searchParams.append(k, String(v));
  }
  Effect.runSync(normalizeAwsExecuteUrlEffect(url, pathTemplate, op.specLabel));

  const method = op.method.toUpperCase();
  const wantsBinary =
    op.requestBodyContentType === "multipart/form-data" ||
    op.requestBodyContentType === "application/octet-stream" ||
    op.requestBodyContentType === "application/pdf" ||
    op.requestBodyContentType === "application/x-www-form-urlencoded";
  const isTikaVersionGet =
    method === "GET" &&
    op.specLabel === "tika" &&
    (op.path === "/version" || op.flatPath === "/version");
  const isTikaPutParse =
    op.specLabel === "tika" && method === "PUT" && (op.path === "/tika" || op.flatPath === "/tika");
  const isNextcloudPropfind = method === "PROPFIND" && op.specLabel === "nextcloud";
  const headers: Record<string, string> = {
    Accept: isTikaVersionGet
      ? "text/plain"
      : isTikaPutParse
        ? "application/json"
        : isNextcloudPropfind
          ? "application/xml"
          : wantsBinary
            ? "*/*"
            : "application/json",
    ...Effect.runSync(mergedAuthHeadersEffect(op.specLabel)),
  };
  if (isNextcloudPropfind) {
    headers.Depth =
      typeof args.depth === "string" && args.depth.trim() ? String(args.depth).trim() : "1";
  }
  const init: FetchRequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD" && method !== "PROPFIND" && op.requestBody) {
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
      const enc =
        typeof args.bodyEncoding === "string" ? String(args.bodyEncoding).trim().toLowerCase() : "";
      if (Buffer.isBuffer(raw)) {
        init.body = raw as never;
      } else if (raw instanceof Uint8Array) {
        init.body = Buffer.from(raw) as never;
      } else if (typeof raw === "string") {
        if (enc === "base64") {
          init.body = Buffer.from(raw, "base64") as never;
        } else {
          init.body = Buffer.from(raw, "utf8") as never;
        }
      } else {
        return {
          ok: false,
          error:
            'application/octet-stream requires execute args.body as string, Buffer, or Uint8Array (optional args.bodyEncoding: "base64" for PDF/binary)',
        };
      }
      const bodyCt =
        typeof args.bodyContentType === "string" && args.bodyContentType.trim()
          ? String(args.bodyContentType).trim()
          : "application/octet-stream";
      headers["Content-Type"] = bodyCt;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(buildRestRequestBodyFromArgs(op, args));
    }
  }

  try {
    const awsSigned = await Effect.runPromise(
      maybeSignAwsRequestEffect(
        url,
        pathTemplate,
        {
          method,
          headers,
          body:
            init.body === undefined
              ? undefined
              : typeof init.body === "string"
                ? init.body
                : Buffer.isBuffer(init.body)
                  ? init.body
                  : init.body instanceof Uint8Array
                    ? Buffer.from(init.body)
                    : undefined,
        },
        openapi,
        op.specLabel
      )
    );
    if (awsSigned) {
      Object.assign(headers, awsSigned.headers);
      init.headers = headers;
      if (awsSigned.body !== undefined) {
        init.body = awsSigned.body as never;
      }
    } else if (
      Effect.runSync(isAwsSpecLabelEffect(op.specLabel ?? "")) ||
      Effect.runSync(isAwsSpecLabelEffect(process.env.CLAWQL_PROVIDER?.trim().toLowerCase() ?? ""))
    ) {
      return {
        ok: false,
        error:
          "AWS execute requires SigV4 credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or CLAWQL_AWS_* aliases). Optional: AWS_SESSION_TOKEN, AWS_REGION.",
      };
    }

    const { fetch: doFetch, backend } = Effect.runSync(getFetchImplForRestEffect());
    const diag = Effect.runSync(envTruthyEffect("CLAWQL_UPSTREAM_FETCH_DIAG"));
    const phaseOn = Effect.runSync(upstreamPhaseEnabled());
    const slowMs = Effect.runSync(upstreamFetchSlowMsEffect());
    // tPrep0 marks start of signed-request → response parse (fetch is the middle slice).
    const tPrep0 = performance.now();
    const tIssueIso = new Date().toISOString();
    const tcpBefore = Effect.runSync(outboundTcpConnectsEffect());
    const phaseSlot = phaseOn
      ? Effect.runSync(beginUpstreamClientPhase({ url: url.toString(), backend }))
      : null;
    const tFetch0 = performance.now();
    const res = phaseSlot
      ? await runWithUpstreamClientPhase(phaseSlot, () => doFetch(url.toString(), init))
      : await doFetch(url.toString(), init);
    const tHeaders = performance.now();
    // Optional chaining: unit-test fetch stubs often omit Headers.
    const contentType = res.headers?.get?.("content-type") ?? "";
    const binary =
      Boolean(contentType) &&
      (/application\/pdf/i.test(contentType) ||
        /application\/octet-stream/i.test(contentType) ||
        /image\//i.test(contentType));

    const logUpstream = (opts: {
      bodyBytes: number;
      parseDoneAt: number;
      phase: "json" | "binary";
    }) => {
      if (!diag && !phaseOn) return;
      const headersMs = tHeaders - tFetch0;
      const bodyMs = opts.parseDoneAt - tHeaders;
      const fetchMs = opts.parseDoneAt - tFetch0;
      const totalMs = opts.parseDoneAt - tPrep0;
      // FETCH_DIAG: slow-only. UPSTREAM_PHASE=1: every execute (phase bisect).
      const slow = totalMs >= slowMs || headersMs >= slowMs;
      if (!phaseOn && !slow) return;
      const tcpAfter = Effect.runSync(outboundTcpConnectsEffect());
      if (diag && slow) {
        console.error(
          `[clawql-upstream-fetch] total_ms=${totalMs.toFixed(1)} fetch_ms=${fetchMs.toFixed(1)} ` +
            `headers_ms=${headersMs.toFixed(1)} body_ms=${bodyMs.toFixed(1)} ` +
            `status=${res.status} backend=${backend} phase=${opts.phase} ` +
            `tcp_connects_delta=${tcpAfter - tcpBefore} tcp_connects_total=${tcpAfter} ` +
            `issue_iso=${tIssueIso} method=${method} url=${url.toString()} body_bytes=${opts.bodyBytes}`
        );
      }
      if (phaseSlot && (phaseOn || slow)) {
        const breakdown = Effect.runSync(
          classifyUpstreamPhase(phaseSlot, {
            tFetch0,
            tHeaders,
            tDone: opts.parseDoneAt,
          })
        );
        console.error(
          formatUpstreamPhaseLog(phaseSlot, breakdown, {
            total_ms: Number(totalMs.toFixed(1)),
            status: res.status,
            body_bytes: opts.bodyBytes,
            tcp_connects_delta: tcpAfter - tcpBefore,
          })
        );
      }
    };

    if (binary && typeof res.arrayBuffer === "function") {
      const buf = Buffer.from(await res.arrayBuffer());
      logUpstream({
        bodyBytes: buf.byteLength,
        parseDoneAt: performance.now(),
        phase: "binary",
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `REST HTTP ${res.status}: binary ${contentType || "body"} (${buf.byteLength} bytes)`,
        };
      }
      // Base64 wrapper so IDP hops can chain PDF bytes (Stirling / Gotenberg / Nextcloud).
      return {
        ok: true,
        data: {
          contentType: contentType || "application/octet-stream",
          encoding: "base64",
          data: buf.toString("base64"),
          byteLength: buf.byteLength,
        },
      };
    }

    const text = await res.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep text payload
    }
    logUpstream({
      bodyBytes: Buffer.byteLength(text),
      parseDoneAt: performance.now(),
      phase: "json",
    });
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

export function executeRestOperationEffect(
  op: Operation,
  args: Record<string, unknown>,
  openapi: OpenAPIDoc
): Effect.Effect<{ ok: true; data: unknown } | { ok: false; error: string }, Error> {
  return Effect.tryPromise({
    try: () => executeRestOperationImpl(op, args, openapi),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link executeRestOperationEffect} for Effect callers. */
export async function executeRestOperation(
  op: Operation,
  args: Record<string, unknown>,
  openapi: OpenAPIDoc
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  return Effect.runPromise(executeRestOperationEffect(op, args, openapi));
}
