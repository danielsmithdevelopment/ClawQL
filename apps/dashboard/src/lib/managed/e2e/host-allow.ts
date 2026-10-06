import { Effect } from "effect";

/**
 * Compare the hostname of a host or URL to an expected name.
 * Substring checks are not used — `https://evil.example/api.github.com` must not match.
 */
export function hostnameEquals(raw: string, expected: string): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    try {
      const href = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
      return new URL(href).hostname.toLowerCase() === expected.toLowerCase();
    } catch {
      return false;
    }
  });
}
