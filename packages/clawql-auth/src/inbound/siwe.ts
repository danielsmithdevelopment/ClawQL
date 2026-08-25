/**
 * Phase 5 — Sign-In with Ethereum (EIP-4361) as primary inbound login → ATR claims.
 * Effect-primary; signature recovery via viem (workspace dependency).
 */

import { randomBytes } from "node:crypto";
import { Data, Effect } from "effect";
import { getAddress, verifyMessage, type Hex, type Address } from "viem";

import type { AtrClaims } from "../gateway.js";
import type { NonceRecord, SecretStore } from "../stores/types.js";
import { SecretStoreError } from "../stores/types.js";

export class SiweError extends Data.TaggedError("SiweError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type SiweConfig = {
  domain: string;
  uri: string;
  chainIds?: number[];
  statement?: string;
  version?: string;
  nonceTtlSeconds?: number;
  now?: () => number;
};

export type SiweNonceIssue = {
  nonce: string;
  expiresAtMs: number;
  messagePreview: string;
};

export type SiweVerifyInput = {
  message: string;
  signature: Hex | string;
};

const NONCE_PURPOSE = "siwe";

function normalizeAddress(addr: string): Address {
  return getAddress(addr);
}

/** Parse EIP-4361 fields we care about (domain, address, uri, version, chainId, nonce, issuedAt). */
export function parseSiweMessage(message: string): {
  domain: string;
  address: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  statement?: string;
} {
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const header = lines[0] ?? "";
  const m = /^(.+) wants you to sign in with your Ethereum account:\s*$/.exec(header);
  if (!m) throw new Error("invalid_siwe_header");
  const domain = m[1]!.trim();
  const address = (lines[1] ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("invalid_siwe_address");

  let statement: string | undefined;
  let i = 2;
  if (lines[i] === "") i += 1;
  if (lines[i] && !lines[i]!.includes(":")) {
    statement = lines[i];
    i += 1;
    if (lines[i] === "") i += 1;
  }

  const fields: Record<string, string> = {};
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const idx = line.indexOf(": ");
    if (idx < 0) continue;
    fields[line.slice(0, idx)] = line.slice(idx + 2);
  }

  const uri = fields.URI;
  const version = fields.Version ?? "1";
  const chainId = Number.parseInt(fields["Chain ID"] ?? "1", 10);
  const nonce = fields.Nonce;
  if (!uri || !nonce) throw new Error("invalid_siwe_fields");

  return { domain, address, uri, version, chainId, nonce, statement };
}

export function buildSiweMessage(input: {
  domain: string;
  address: string;
  uri: string;
  version?: string;
  chainId: number;
  nonce: string;
  statement?: string;
  issuedAt?: string;
}): string {
  const address = normalizeAddress(input.address);
  const lines = [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
  ];
  if (input.statement) {
    lines.push(input.statement, "");
  }
  lines.push(
    `URI: ${input.uri}`,
    `Version: ${input.version ?? "1"}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt ?? new Date().toISOString()}`
  );
  return lines.join("\n");
}

export function issueSiweNonceEffect(
  store: SecretStore,
  config: SiweConfig
): Effect.Effect<SiweNonceIssue, SecretStoreError> {
  return Effect.gen(function* () {
    const now = config.now ?? Date.now;
    const ttl = (config.nonceTtlSeconds ?? 600) * 1000;
    const nonce = randomBytes(16).toString("hex");
    const expiresAtMs = now() + ttl;
    const record: NonceRecord = {
      nonce,
      purpose: NONCE_PURPOSE,
      createdAtMs: now(),
      expiresAtMs,
      meta: { domain: config.domain, uri: config.uri },
    };
    yield* store.storeNonce(nonce, record);
    return {
      nonce,
      expiresAtMs,
      messagePreview: buildSiweMessage({
        domain: config.domain,
        address: "0x0000000000000000000000000000000000000000",
        uri: config.uri,
        chainId: config.chainIds?.[0] ?? 1,
        nonce,
        statement: config.statement,
      }),
    };
  });
}

export function verifySiweLoginEffect(
  store: SecretStore,
  input: SiweVerifyInput,
  config: SiweConfig
): Effect.Effect<AtrClaims, SiweError | SecretStoreError> {
  return Effect.gen(function* () {
    let parsed: ReturnType<typeof parseSiweMessage>;
    try {
      parsed = parseSiweMessage(input.message);
    } catch (cause) {
      return yield* Effect.fail(
        new SiweError({
          reason: cause instanceof Error ? cause.message : "parse_failed",
          cause,
        })
      );
    }

    if (parsed.domain !== config.domain) {
      return yield* Effect.fail(new SiweError({ reason: "domain_mismatch" }));
    }
    if (parsed.uri !== config.uri) {
      return yield* Effect.fail(new SiweError({ reason: "uri_mismatch" }));
    }
    if (config.chainIds?.length && !config.chainIds.includes(parsed.chainId)) {
      return yield* Effect.fail(new SiweError({ reason: "chain_id_not_allowed" }));
    }

    const stored = yield* store.getNonce(parsed.nonce);
    if (!stored || stored.purpose !== NONCE_PURPOSE) {
      return yield* Effect.fail(new SiweError({ reason: "nonce_unknown" }));
    }
    const now = (config.now ?? Date.now)();
    if (stored.consumedAtMs != null) {
      return yield* Effect.fail(new SiweError({ reason: "nonce_consumed" }));
    }
    if (stored.expiresAtMs <= now) {
      return yield* Effect.fail(new SiweError({ reason: "nonce_expired" }));
    }

    const ok = yield* Effect.tryPromise({
      try: () =>
        verifyMessage({
          address: normalizeAddress(parsed.address),
          message: input.message,
          signature: input.signature as Hex,
        }),
      catch: (cause) => new SiweError({ reason: "signature_verify_failed", cause }),
    });
    if (!ok) {
      return yield* Effect.fail(new SiweError({ reason: "bad_signature" }));
    }

    yield* store.markNonceConsumed(parsed.nonce);

    const address = normalizeAddress(parsed.address);
    return {
      sub: address.toLowerCase(),
      role: "operator",
      scope: ["execute", "search", "memory"],
      walletAddress: address.toLowerCase(),
    } satisfies AtrClaims;
  });
}
