/**
 * Security helpers for user-provided custom source ids and fetch URLs.
 */

import { isIP } from "node:net";
import { resolve, sep } from "node:path";
import { Effect } from "effect";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.google"]);

/** True for loopback, RFC1918, link-local, and unique-local IPv6 addresses. */
export function isPrivateOrLoopbackIp(host: string): boolean {
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (ipVersion === 6) {
    const h = host.toLowerCase();
    if (h === "::1") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("fe80:")) return true;
  }
  return false;
}

/** Reject path traversal and unsafe characters in source directory names. */
export function assertSafeSourceId(id: string): string {
  const s = id.trim();
  if (!s || s.length > 64) {
    throw new Error("Invalid source id: must be 1–64 characters.");
  }
  const first = s[0]!;
  if (!((first >= "a" && first <= "z") || (first >= "0" && first <= "9"))) {
    throw new Error("Invalid source id: use lowercase letters, digits, and hyphens only.");
  }
  for (let i = 1; i < s.length; i += 1) {
    const ch = s[i]!;
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "-") {
      continue;
    }
    throw new Error("Invalid source id: use lowercase letters, digits, and hyphens only.");
  }
  return s;
}

/** Resolve a relative path under a base directory; rejects traversal outside base. */
export function resolveSafePathUnder(base: string, relative: string): string {
  const root = resolve(base);
  const abs = resolve(root, relative);
  if (abs !== root && !abs.startsWith(`${root}${sep}`)) {
    throw new Error("Invalid path: must stay within the source home directory.");
  }
  return abs;
}

/** Allow HTTPS (and optional HTTP) fetches to public hosts only — blocks SSRF to private networks. */
export function assertSafeSourceFetchUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Invalid source URL.");
  }

  const allowHttp = process.env.CLAWQL_SOURCES_ALLOW_HTTP?.trim() === "1";
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error("Source URL must use HTTPS.");
  }

  // URL.hostname keeps brackets on IPv6 literals; strip before isIP checks.
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error("Source URL host is not allowed.");
  }
  if (isPrivateOrLoopbackIp(host)) {
    throw new Error("Source URL must not target private or loopback addresses.");
  }
  // CGNAT 100.64.0.0/10
  {
    const parts = host.split(".").map((p) => Number.parseInt(p, 10));
    if (
      parts.length === 4 &&
      parts[0] === 100 &&
      parts[1]! >= 64 &&
      parts[1]! <= 127 &&
      parts.every((n) => !Number.isNaN(n))
    ) {
      throw new Error("Source URL must not target private or loopback addresses.");
    }
  }
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice("::ffff:".length);
    if (isPrivateOrLoopbackIp(mapped)) {
      throw new Error("Source URL must not target private or loopback addresses.");
    }
  }

  return parsed;
}

/** Resolve hostname and refuse if any address is private/loopback (audit 2.09). */
export async function assertSafeSourceFetchUrlResolved(raw: string): Promise<URL> {
  const url = assertSafeSourceFetchUrl(raw);
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (isIP(host)) return url;
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(host, { all: true });
  for (const r of results) {
    if (isPrivateOrLoopbackIp(r.address)) {
      throw new Error("Source URL must not resolve to private or loopback addresses.");
    }
  }
  return url;
}

/** Fetch a user URL only after SSRF validation (single chokepoint for CodeQL + runtime policy). */
async function fetchSafeSourceUrlImpl(
  raw: string,
  fetchFn: typeof fetch = fetch
): Promise<{ url: URL; response: Response }> {
  const url = await assertSafeSourceFetchUrlResolved(raw);
  // Do not follow redirects automatically — each hop must be re-validated (audit 2.09).
  // codeql[js/request-forgery]: href is validated for public HTTPS hosts only (assertSafeSourceFetchUrl).
  let response = await fetchFn(url.href, { redirect: "manual" });
  let hops = 0;
  let current = url;
  while (
    hops < 5 &&
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.get("location")
  ) {
    hops += 1;
    const nextRaw = new URL(response.headers.get("location")!, current).href;
    current = await assertSafeSourceFetchUrlResolved(nextRaw);
    response = await fetchFn(current.href, { redirect: "manual" });
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Source URL redirect limit exceeded.");
  }
  return { url, response };
}

export function fetchSafeSourceUrlEffect(
  raw: string,
  fetchFn: typeof fetch = fetch
): Effect.Effect<{ url: URL; response: Response }, Error> {
  return Effect.tryPromise({
    try: () => fetchSafeSourceUrlImpl(raw, fetchFn),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link fetchSafeSourceUrlEffect} for Effect callers. */
export async function fetchSafeSourceUrl(
  raw: string,
  fetchFn: typeof fetch = fetch
): Promise<{ url: URL; response: Response }> {
  return Effect.runPromise(fetchSafeSourceUrlEffect(raw, fetchFn));
}
