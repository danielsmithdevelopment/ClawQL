import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Effect } from "effect";

import { getWorld } from "@/lib/managed/e2e/world";

export function isPrivateIp(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "127.0.0.1" || n === "::1" || n === "0.0.0.0" || n === "localhost") return true;
  if (n.startsWith("10.") || n.startsWith("192.168.") || n.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(n)) return true;
  if (n.startsWith("::ffff:")) return isPrivateIp(n.slice(7));
  return false;
}

export function looksLikeDecimalIp(host: string): boolean {
  return /^\d+$/.test(host) || /^0x/i.test(host);
}

/** Names used to simulate DNS rebinding without a live resolver. */
export function isRebindHostname(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower.includes("rebind")) return true;
  if (lower === "metadata.google.internal") return true;
  if (lower.endsWith(".internal")) return true;
  return false;
}

/**
 * SSRF / rebind refusal for webhook subscribe hosts (EV-02 / EV-03).
 * Rebind names are refused even if they later appear on the allowlist.
 * Allowlisted hosts skip DNS (hooks.example.com is a harness stand-in).
 */
export function webhookHostRefused(host: string): Effect.Effect<string | null> {
  return Effect.gen(function* () {
    const lower = host.toLowerCase().replace(/^\[|\]$/g, "");
    if (looksLikeDecimalIp(lower)) return "decimal IP refused";
    if (isIP(lower) && isPrivateIp(lower)) return "private address refused";
    if (isRebindHostname(lower)) return "rebind to private address refused";

    const world = getWorld();
    const onAllowlist = world.allowedWebhookHosts.some(
      (h) => h === lower || lower.endsWith(`.${h}`),
    );
    if (onAllowlist) return null;

    // Non-allowlisted hosts: resolve and refuse private answers (best-effort).
    const results = yield* Effect.promise(() =>
      lookup(lower, { all: true }).catch(() => [] as { address: string }[]),
    );
    for (const r of results) {
      if (isPrivateIp(r.address)) return "resolved to private address";
    }
    return "host not on allowed list";
  });
}
