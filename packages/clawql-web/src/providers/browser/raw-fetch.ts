/**
 * Direct HTTPS/HTTP raw fetch for IDP URL ingestion parity.
 * Mirrors clawql-documents `fetchUrlResource` behaviors so the IDP migration
 * can switch to clawql-web without silently changing timeouts, redirects, or SSRF gates.
 *
 * @see packages/clawql-documents/src/ingest/external-ingest.ts
 */

import { isIP } from "node:net";
import { assertSafeSourceFetchUrl, isPrivateOrLoopbackIp } from "clawql-api";
import { Effect } from "effect";

const MAX_URL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_URL_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 60_000;

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; clawql-web/1.0; +https://github.com/danielsmithdevelopment/ClawQL)";

export type RawFetchResult = {
  url: string;
  finalUrl: string;
  bytes: Uint8Array;
  contentType: string | null;
  provider: "raw-http";
};

function loopbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_WEB_ALLOW_LOOPBACK?.trim() === "1";
}

function isLoopbackHostname(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h.endsWith(".localhost")
  );
}

/**
 * SSRF gate for web ingest (audit 4.06).
 * Sync hostname/IP checks via shared source helper; loopback refused unless
 * `CLAWQL_WEB_ALLOW_LOOPBACK=1` (tests). Fetch path also resolves DNS.
 */
export function assertSafeWebUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("invalid url");
  }
  const host = parsed.hostname.trim().toLowerCase();
  if (isLoopbackHostname(host)) {
    if (!loopbackAllowed()) {
      throw new Error(
        "URL must not target loopback (set CLAWQL_WEB_ALLOW_LOOPBACK=1 for local tests only)"
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("only http and https URLs are allowed");
    }
    return parsed;
  }
  // Public hosts: same rules as source fetch (blocks private IP literals, metadata hosts).
  return assertSafeSourceFetchUrl(urlStr);
}

/** Audit W2: sync hostname checks + DNS resolve before browser navigate / fetch. */
export async function assertSafeWebUrlResolved(urlStr: string): Promise<URL> {
  const sync = assertSafeWebUrl(urlStr);
  if (isLoopbackHostname(sync.hostname) && loopbackAllowed()) {
    return sync;
  }
  let host = sync.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (isIP(host)) return sync;
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(host, { all: true });
  for (const r of results) {
    if (isPrivateOrLoopbackIp(r.address)) {
      throw new Error("URL must not resolve to private or loopback addresses");
    }
  }
  return sync;
}

async function fetchRawUrlImpl(
  urlStr: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    dryRun?: boolean;
    fetchImpl?: typeof fetch;
    /** Override User-Agent (IDP may pass legacy `clawql-mcp-external-ingest/1.0`). */
    userAgent?: string;
  } = {}
): Promise<RawFetchResult> {
  if (options.dryRun) {
    const text = `dry-run raw bytes for ${urlStr}`;
    return {
      url: urlStr,
      finalUrl: urlStr,
      bytes: new TextEncoder().encode(text),
      contentType: "text/plain; charset=utf-8",
      provider: "raw-http",
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_URL_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent?.trim() || DEFAULT_UA;
  let current = (await assertSafeWebUrlResolved(urlStr)).href;

  for (let hop = 0; hop <= MAX_URL_REDIRECTS; hop += 1) {
    const res = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": userAgent,
        Accept: "*/*",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc?.trim()) {
        throw new Error(`HTTP ${res.status} redirect without Location`);
      }
      current = (await assertSafeWebUrlResolved(new URL(loc, current).href)).href;
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const len = res.headers.get("content-length");
    if (len && Number.parseInt(len, 10) > maxBytes) {
      throw new Error("Content-Length exceeds cap");
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new Error("response body exceeds cap");
    }
    const rawCt = res.headers.get("content-type");
    const contentType = rawCt?.split(";")[0]?.trim() ?? null;
    return {
      url: urlStr,
      finalUrl: current,
      bytes: buf,
      contentType,
      provider: "raw-http",
    };
  }
  throw new Error("too many redirects");
}

export function fetchRawUrlEffect(
  urlStr: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    dryRun?: boolean;
    fetchImpl?: typeof fetch;
    userAgent?: string;
  } = {}
): Effect.Effect<RawFetchResult, Error> {
  return Effect.tryPromise({
    try: () => fetchRawUrlImpl(urlStr, options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link fetchRawUrlEffect} for Effect callers. */
export async function fetchRawUrl(
  urlStr: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    dryRun?: boolean;
    fetchImpl?: typeof fetch;
    userAgent?: string;
  } = {}
): Promise<RawFetchResult> {
  return Effect.runPromise(fetchRawUrlEffect(urlStr, options));
}
