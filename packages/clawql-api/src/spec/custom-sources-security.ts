/**
 * Security helpers for user-provided custom source ids and fetch URLs.
 *
 * URL / SSRF checks are owned by `clawql-core` egress (audit 5.07); this module
 * re-exports them so existing `clawql-api` import paths keep working.
 */

import { resolve, sep } from "node:path";
import { Effect } from "effect";
import {
  assertSafeSourceFetchUrl,
  assertSafeSourceFetchUrlResolved,
  assertSafeSourceFetchUrlResolvedEffect,
  expandIpv4MappedIpv6,
  isPrivateOrLoopbackIp,
} from "clawql-core";

export {
  assertSafeSourceFetchUrl,
  assertSafeSourceFetchUrlResolved,
  assertSafeSourceFetchUrlResolvedEffect,
  expandIpv4MappedIpv6,
  isPrivateOrLoopbackIp,
};

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
