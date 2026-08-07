/**
 * Direct HTTPS/HTTP raw fetch for IDP URL ingestion parity.
 * Mirrors clawql-documents `fetchUrlResource` behaviors so the IDP migration
 * can switch to clawql-web without silently changing timeouts, redirects, or SSRF gates.
 *
 * @see packages/clawql-documents/src/ingest/external-ingest.ts
 */

import { isPrivateOrLoopbackIp } from "clawql-api";

const MAX_URL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_URL_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 60_000;
const BLOCKED_HOSTNAMES = new Set(["metadata.google.internal", "metadata.google"]);

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; clawql-web/1.0; +https://github.com/danielsmithdevelopment/ClawQL)";

export type RawFetchResult = {
  url: string;
  finalUrl: string;
  bytes: Uint8Array;
  contentType: string | null;
  provider: "raw-http";
};

/** SSRF gate — same posture as IDP external ingest. */
export function assertSafeWebUrl(urlStr: string): URL {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("only http and https URLs are allowed");
  }
  const host = u.hostname.trim().toLowerCase();
  const isLoopbackHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (u.protocol === "http:" && !isLoopbackHost) {
    throw new Error("http is only allowed for localhost; use https");
  }
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error("URL host is not allowed");
  }
  if (!isLoopbackHost && isPrivateOrLoopbackIp(host)) {
    throw new Error("URL must not target private or link-local addresses");
  }
  return u;
}

export async function fetchRawUrl(
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
  let current = assertSafeWebUrl(urlStr).href;

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
      current = assertSafeWebUrl(new URL(loc, current).href).href;
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
