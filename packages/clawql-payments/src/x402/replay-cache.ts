/**
 * Audit 6.01: refuse reused x402 payment payloads / nonces after verify+settle.
 */

import { createHash } from "node:crypto";

export type X402ReplayCache = {
  readonly seen: (key: string) => boolean;
  readonly remember: (key: string) => void;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function createX402ReplayCache(options?: {
  ttlMs?: number;
  maxEntries?: number;
}): X402ReplayCache {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options?.maxEntries ?? 10_000;
  const entries = new Map<string, number>();

  const prune = (now: number) => {
    for (const [k, exp] of entries) {
      if (exp <= now) entries.delete(k);
    }
    while (entries.size > maxEntries) {
      const first = entries.keys().next().value;
      if (first === undefined) break;
      entries.delete(first);
    }
  };

  return {
    seen: (key: string) => {
      const now = Date.now();
      prune(now);
      const exp = entries.get(key);
      return exp !== undefined && exp > now;
    },
    remember: (key: string) => {
      const now = Date.now();
      prune(now);
      entries.set(key, now + ttlMs);
    },
  };
}

let shared: X402ReplayCache | undefined;

export function sharedX402ReplayCache(): X402ReplayCache {
  if (!shared) shared = createX402ReplayCache();
  return shared;
}

export function resetSharedX402ReplayCacheForTests(): void {
  shared = createX402ReplayCache();
}

export function hashX402PaymentPayload(payload: unknown): string {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  return createHash("sha256").update(raw).digest("hex");
}
