/**
 * AES-256-GCM encrypt/decrypt (Web Crypto + Node crypto).
 * Worker holds the content key for the contest demo; Lit is a later upgrade.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type EncryptedRelease = {
  algorithm: "aes-256-gcm";
  nonceHex: string;
  ciphertextHex: string;
  /** SHA-256 of plaintext — published in the public (ciphertext) manifest. */
  plaintextSha256: string;
};

export type EncryptedReleaseWithKey = EncryptedRelease & {
  /** Never publish. Held by the unlock Worker (or Lit later). */
  keyHex: string;
};

function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function encryptRelease(
  plaintext: Buffer | Uint8Array,
  key?: Buffer
): EncryptedReleaseWithKey {
  const k = key ?? randomBytes(32);
  if (k.length !== 32) throw new Error("AES-256-GCM key must be 32 bytes");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, nonce);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    nonceHex: nonce.toString("hex"),
    ciphertextHex: Buffer.concat([enc, tag]).toString("hex"),
    plaintextSha256: sha256Hex(Buffer.from(plaintext)),
    keyHex: k.toString("hex"),
  };
}

export function decryptRelease(blob: EncryptedReleaseWithKey): Buffer {
  const k = Buffer.from(blob.keyHex, "hex");
  const nonce = Buffer.from(blob.nonceHex, "hex");
  const raw = Buffer.from(blob.ciphertextHex, "hex");
  if (raw.length < 16) throw new Error("ciphertext too short");
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", k, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  if (sha256Hex(plain) !== blob.plaintextSha256) {
    throw new Error("plaintext hash mismatch after decrypt");
  }
  return plain;
}

/** Public metadata safe to put next to an Arweave ciphertext tx. */
export function publicCipherMeta(blob: EncryptedReleaseWithKey): EncryptedRelease {
  const { keyHex: _k, ...pub } = blob;
  return pub;
}
