/**
 * Security helpers for user-provided custom source ids and fetch URLs.
 */

import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.google"]);

function isPrivateOrLoopbackIp(host: string): boolean {
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
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
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) {
    throw new Error("Invalid source id: use lowercase letters, digits, and hyphens only.");
  }
  return s;
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

  const host = parsed.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error("Source URL host is not allowed.");
  }
  if (isPrivateOrLoopbackIp(host)) {
    throw new Error("Source URL must not target private or loopback addresses.");
  }

  return parsed;
}
