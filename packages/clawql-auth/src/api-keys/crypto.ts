/**
 * API key crypto/format helpers. Effect is the primary surface: {@link generateApiKeyIdEffect},
 * {@link generateApiKeySaltEffect}, {@link generateApiKeySecretPartEffect},
 * {@link formatApiKeySecretEffect}, {@link parseApiKeySecretEffect}, {@link hashApiKeySecretEffect},
 * {@link hashesEqualEffect}. The plain sync functions below are module-internal implementation
 * detail for those wrappers and are not re-exported from the package entry.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Effect } from "effect";

const KEY_PREFIX = "cqk";
const ID_HEX_LEN = 16;
const SECRET_BYTES = 24;

/** Public id: `cqk_<16 hex>`. */
function generateApiKeyId(): string {
  return `${KEY_PREFIX}_${randomBytes(ID_HEX_LEN / 2).toString("hex")}`;
}

function generateApiKeySalt(): string {
  return randomBytes(16).toString("hex");
}

/** Random secret segment (base64url). */
function generateApiKeySecretPart(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/**
 * Full secret format: `cqk_<idHex>_<secretPart>` where id is without the `cqk_` prefix duplication.
 * Example: `cqk_a1b2c3d4e5f67890_xYz...`
 */
function formatApiKeySecret(id: string, secretPart: string): string {
  const idHex = id.startsWith(`${KEY_PREFIX}_`) ? id.slice(KEY_PREFIX.length + 1) : id;
  return `${KEY_PREFIX}_${idHex}_${secretPart}`;
}

export type ParsedApiKey = {
  id: string;
  secretPart: string;
  raw: string;
};

/**
 * Parse a presented secret. Accepts `cqk_<16hex>_<secret>`.
 */
function parseApiKeySecret(raw: string): ParsedApiKey | null {
  const trimmed = raw.trim();
  const m = /^cqk_([a-f0-9]{16})_(.+)$/i.exec(trimmed);
  if (!m) return null;
  return {
    id: `${KEY_PREFIX}_${m[1]!.toLowerCase()}`,
    secretPart: m[2]!,
    raw: trimmed,
  };
}

function hashApiKeySecret(salt: string, rawSecret: string): string {
  return createHash("sha256").update(`${salt}:${rawSecret}`, "utf8").digest("hex");
}

function hashesEqual(presentedHex: string, storedHex: string): boolean {
  const a = Buffer.from(presentedHex, "utf8");
  const b = Buffer.from(storedHex, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Effect: generate a public key id (`cqk_<16 hex>`). */
export const generateApiKeyIdEffect = (): Effect.Effect<string> => Effect.sync(generateApiKeyId);

/** Effect: generate a per-key salt (hex). */
export const generateApiKeySaltEffect = (): Effect.Effect<string> =>
  Effect.sync(generateApiKeySalt);

/** Effect: generate a random secret segment (base64url). */
export const generateApiKeySecretPartEffect = (): Effect.Effect<string> =>
  Effect.sync(generateApiKeySecretPart);

/** Effect: format the full secret shown once at issue time. */
export const formatApiKeySecretEffect = (id: string, secretPart: string): Effect.Effect<string> =>
  Effect.sync(() => formatApiKeySecret(id, secretPart));

/** Effect: parse a presented secret; succeeds with `null` when the format doesn't match. */
export const parseApiKeySecretEffect = (raw: string): Effect.Effect<ParsedApiKey | null> =>
  Effect.sync(() => parseApiKeySecret(raw));

/** Effect: salted SHA-256 hash of a raw secret. */
export const hashApiKeySecretEffect = (salt: string, rawSecret: string): Effect.Effect<string> =>
  Effect.sync(() => hashApiKeySecret(salt, rawSecret));

/** Effect: timing-safe hex digest comparison. */
export const hashesEqualEffect = (
  presentedHex: string,
  storedHex: string
): Effect.Effect<boolean> => Effect.sync(() => hashesEqual(presentedHex, storedHex));
