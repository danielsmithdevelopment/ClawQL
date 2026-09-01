/**
 * Phase 4 — domain ownership via DNS TXT challenge.
 * Effect-primary; DNS IO via Effect.tryPromise (injectable for tests).
 */

import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { Data, Effect } from "effect";

import type { AuthEventSink } from "../audit/auth-events.js";
import { emitAuthEventEffect } from "../audit/auth-events.js";
import type { DomainChallenge, SecretStore } from "../stores/types.js";
import { SecretStoreError } from "../stores/types.js";

export class DomainTxtError extends Data.TaggedError("DomainTxtError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type DomainTxtResolve = (hostname: string) => Effect.Effect<string[][], DomainTxtError>;

export type DomainTxtConfig = {
  /** TXT hostname prefix (default `_clawql-verify`). */
  prefix?: string;
  /** Challenge TTL seconds (default 86400). */
  ttlSeconds?: number;
  now?: () => number;
  /** Injectable DNS (tests). */
  resolveTxt?: DomainTxtResolve;
  eventSink?: AuthEventSink;
};

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "").replace(/^@/, "");
}

function defaultResolveTxt(): DomainTxtResolve {
  return (hostname) =>
    Effect.tryPromise({
      try: () => dns.resolveTxt(hostname),
      catch: (cause) =>
        new DomainTxtError({
          reason: cause instanceof Error ? cause.message : "dns_resolve_failed",
          cause,
        }),
    });
}

export function domainTxtHostname(domain: string, prefix = "_clawql-verify"): string {
  return `${prefix}.${normalizeDomain(domain)}`;
}

export function createDomainChallengeEffect(
  store: SecretStore,
  domain: string,
  config: DomainTxtConfig = {}
): Effect.Effect<DomainChallenge, DomainTxtError | SecretStoreError> {
  return Effect.gen(function* () {
    const normalized = normalizeDomain(domain);
    if (!normalized || !normalized.includes(".")) {
      return yield* Effect.fail(new DomainTxtError({ reason: "invalid_domain" }));
    }
    const now = config.now ?? Date.now;
    const ttlSeconds = config.ttlSeconds ?? 86_400;
    const challenge: DomainChallenge = {
      domain: normalized,
      challenge: `clawql-domain-verify=${randomBytes(16).toString("hex")}`,
      createdAtMs: now(),
      expiresAtMs: now() + ttlSeconds * 1000,
    };
    yield* store.storeDomainChallenge(normalized, challenge);
    return challenge;
  });
}

/**
 * Verify that DNS TXT at `_clawql-verify.<domain>` contains the stored challenge value.
 * On success, deletes the challenge (one-time) and returns the verified domain.
 */
export function verifyDomainTxtEffect(
  store: SecretStore,
  domain: string,
  config: DomainTxtConfig = {}
): Effect.Effect<{ domain: string; challenge: string }, DomainTxtError | SecretStoreError> {
  return Effect.gen(function* () {
    const normalized = normalizeDomain(domain);
    const stored = yield* store.getDomainChallenge(normalized);
    if (!stored) {
      return yield* Effect.fail(new DomainTxtError({ reason: "challenge_not_found" }));
    }
    const now = (config.now ?? Date.now)();
    if (stored.expiresAtMs <= now) {
      yield* store.deleteDomainChallenge(normalized);
      return yield* Effect.fail(new DomainTxtError({ reason: "challenge_expired" }));
    }

    const prefix = config.prefix?.trim() || "_clawql-verify";
    const hostname = domainTxtHostname(normalized, prefix);
    const resolve = config.resolveTxt ?? defaultResolveTxt();
    const records = yield* resolve(hostname);
    const flat = records.map((chunks) => chunks.join(""));
    if (!flat.some((v) => v.includes(stored.challenge))) {
      return yield* Effect.fail(new DomainTxtError({ reason: "txt_mismatch" }));
    }

    yield* store.deleteDomainChallenge(normalized);
    yield* emitAuthEventEffect(config.eventSink, {
      type: "DOMAIN_TXT_VERIFIED",
      domain: normalized,
      timestamp: new Date(now).toISOString(),
    });
    return { domain: normalized, challenge: stored.challenge };
  });
}
