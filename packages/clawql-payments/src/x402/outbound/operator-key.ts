/**
 * Operator-approve key verification (audit Z2).
 * Server stores a SHA-256 hex digest (`CLAWQL_OPERATOR_APPROVE_KEY_HASH`);
 * the plaintext key is entered by the operator (password manager), never kept
 * in clawql.env.
 *
 * SHA-256 without salt is fine for a high-entropy random key (32 bytes).
 * Do not accept human-chosen passwords — use {@link generateOperatorApproveKey}.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashOperatorApproveKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export type GeneratedOperatorApproveKey = {
  /** Base64url plaintext — store in a password manager; never in clawql.env. */
  key: string;
  /** SHA-256 hex digest for CLAWQL_OPERATOR_APPROVE_KEY_HASH. */
  hash: string;
};

/**
 * Generate a 32-byte random operator approve key + its SHA-256 hash.
 * Prefer this over accepting a human-chosen password (unsalted SHA-256 is
 * weak against low-entropy secrets).
 */
export function generateOperatorApproveKey(): GeneratedOperatorApproveKey {
  const key = randomBytes(32).toString("base64url");
  return { key, hash: hashOperatorApproveKey(key) };
}

function hexEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type OperatorKeyVerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a presented operator approve key against the configured hash
 * (preferred) or legacy plaintext env (only when explicitly allowed).
 */
export function verifyOperatorApproveKey(
  presented: string,
  env: NodeJS.ProcessEnv = process.env
): OperatorKeyVerifyResult {
  const hash = env.CLAWQL_OPERATOR_APPROVE_KEY_HASH?.trim().toLowerCase();
  if (hash) {
    const presentedHash = hashOperatorApproveKey(presented).toLowerCase();
    if (!hexEqual(presentedHash, hash)) {
      return { ok: false, reason: "invalid operator approve key" };
    }
    return { ok: true };
  }

  const plaintext = env.CLAWQL_OPERATOR_APPROVE_KEY?.trim();
  if (!plaintext) {
    return {
      ok: false,
      reason: "CLAWQL_OPERATOR_APPROVE_KEY_HASH unset — store sha256 hex of the key (audit Z2)",
    };
  }

  const allowPlain =
    env.CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT?.trim() === "1" ||
    env.CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT?.trim()?.toLowerCase() === "true";
  if (!allowPlain) {
    return {
      ok: false,
      reason:
        "plaintext CLAWQL_OPERATOR_APPROVE_KEY refused — set CLAWQL_OPERATOR_APPROVE_KEY_HASH (sha256 hex) or CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT=1 for migration (audit Z2)",
    };
  }

  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(plaintext, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return { ok: false, reason: "invalid operator approve key" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid operator approve key" };
  }
  return { ok: true };
}

/** True when clawql.env (or similar) still embeds a plaintext operator approve key. */
export function clawqlEnvContainsPlaintextOperatorKey(envFileContents: string): boolean {
  return /^\s*CLAWQL_OPERATOR_APPROVE_KEY\s*=/m.test(envFileContents);
}
