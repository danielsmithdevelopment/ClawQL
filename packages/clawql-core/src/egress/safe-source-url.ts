/**
 * Canonical SSRF helpers for user-supplied fetch URLs (audit 5.07).
 *
 * Strongest check: {@link assertSafeSourceFetchUrlResolved} (parse + DNS private/loopback refuse).
 * Prefer {@link assertSafeSourceFetchUrlResolvedEffect} from Effect callers.
 * `clawql-api` re-exports these for existing import paths — call-site migration is deferred.
 */

import { isIP } from "node:net";
import { Effect } from "effect";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.google"]);

/**
 * Expand IPv4-mapped IPv6 (`::ffff:127.0.0.1` or Node's `::ffff:7f00:1`) to dotted IPv4.
 */
export function expandIpv4MappedIpv6(host: string): string | null {
  const h = host.toLowerCase();
  if (!h.startsWith("::ffff:")) return null;
  const rest = h.slice("::ffff:".length);
  if (isIP(rest) === 4) return rest;
  // Node dns/lookup often returns hex form (::ffff:7f00:1 → 127.0.0.1).
  const hexParts = rest.split(":");
  if (hexParts.length === 2) {
    const hi = Number.parseInt(hexParts[0]!, 16);
    const lo = Number.parseInt(hexParts[1]!, 16);
    if (Number.isFinite(hi) && Number.isFinite(lo)) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }
  return null;
}

/** True for loopback, RFC1918, link-local, CGNAT, and unique-local IPv6 addresses. */
export function isPrivateOrLoopbackIp(host: string): boolean {
  const mapped = expandIpv4MappedIpv6(host);
  if (mapped) return isPrivateOrLoopbackIp(mapped);

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
    // CGNAT 100.64.0.0/10
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
    return false;
  }
  if (ipVersion === 6) {
    const h = host.toLowerCase();
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (h.startsWith("fe80:")) return true;
  }
  return false;
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

  return parsed;
}

/** Resolve hostname and refuse if any address is private/loopback (audit 2.09 / 5.07). */
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

/** Effect wrapper around {@link assertSafeSourceFetchUrlResolved}. */
export function assertSafeSourceFetchUrlResolvedEffect(
  raw: string
): Effect.Effect<URL, Error> {
  return Effect.tryPromise({
    try: () => assertSafeSourceFetchUrlResolved(raw),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}
