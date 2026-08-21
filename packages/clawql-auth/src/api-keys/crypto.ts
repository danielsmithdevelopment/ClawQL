import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "cqk";
const ID_HEX_LEN = 16;
const SECRET_BYTES = 24;

/** Public id: `cqk_<16 hex>`. */
export function generateApiKeyId(): string {
  return `${KEY_PREFIX}_${randomBytes(ID_HEX_LEN / 2).toString("hex")}`;
}

export function generateApiKeySalt(): string {
  return randomBytes(16).toString("hex");
}

/** Random secret segment (base64url). */
export function generateApiKeySecretPart(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/**
 * Full secret format: `cqk_<idHex>_<secretPart>` where id is without the `cqk_` prefix duplication.
 * Example: `cqk_a1b2c3d4e5f67890_xYz...`
 */
export function formatApiKeySecret(id: string, secretPart: string): string {
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
export function parseApiKeySecret(raw: string): ParsedApiKey | null {
  const trimmed = raw.trim();
  const m = /^cqk_([a-f0-9]{16})_(.+)$/i.exec(trimmed);
  if (!m) return null;
  return {
    id: `${KEY_PREFIX}_${m[1]!.toLowerCase()}`,
    secretPart: m[2]!,
    raw: trimmed,
  };
}

export function hashApiKeySecret(salt: string, rawSecret: string): string {
  return createHash("sha256").update(`${salt}:${rawSecret}`, "utf8").digest("hex");
}

export function hashesEqual(presentedHex: string, storedHex: string): boolean {
  const a = Buffer.from(presentedHex, "utf8");
  const b = Buffer.from(storedHex, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
