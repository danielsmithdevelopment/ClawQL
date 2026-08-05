/**
 * Minimal RFC 6238 TOTP (SHA-1, 30s, 6 digits) for payment step-up.
 * No third-party OTP dependency — secrets stay under $CLAWQL_HOME/Payments/.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[parseInt(chunk, 2)]!;
  }
  return out;
}

export function decodeBase32(secret: string): Buffer {
  const cleaned = secret
    .replace(/=+$/g, "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base32 secret");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(
  secretBase32: string,
  options: { timeMs?: number; stepSec?: number; digits?: number } = {}
): string {
  const stepSec = options.stepSec ?? 30;
  const digits = options.digits ?? 6;
  const counter = Math.floor((options.timeMs ?? Date.now()) / 1000 / stepSec);
  const key = decodeBase32(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, "0");
}

/** Verify TOTP with ±1 step window (timing-safe compare). */
export function verifyTotp(
  secretBase32: string,
  token: string,
  options: { timeMs?: number; stepSec?: number; digits?: number; window?: number } = {}
): boolean {
  const digits = options.digits ?? 6;
  const cleaned = token.trim().replace(/\s+/g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length !== digits) return false;
  const window = options.window ?? 1;
  const stepSec = options.stepSec ?? 30;
  const now = options.timeMs ?? Date.now();
  const expected = Buffer.from(cleaned.padStart(digits, "0"));
  for (let w = -window; w <= window; w++) {
    const candidate = generateTotp(secretBase32, {
      timeMs: now + w * stepSec * 1000,
      stepSec,
      digits,
    });
    const candBuf = Buffer.from(candidate);
    if (candBuf.length === expected.length && timingSafeEqual(candBuf, expected)) {
      return true;
    }
  }
  return false;
}

export function totpOtpauthUrl(input: {
  secretBase32: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = encodeURIComponent(input.issuer ?? "ClawQL");
  const account = encodeURIComponent(input.accountName);
  return `otpauth://totp/${issuer}:${account}?secret=${input.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
