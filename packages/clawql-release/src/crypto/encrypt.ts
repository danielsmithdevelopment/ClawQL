import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Effect } from "effect";

export type EncryptedBlob = {
  algorithm: "chacha20-poly1305";
  nonceHex: string;
  ciphertextHex: string;
  /** Raw content-encryption key (hex) — wrap via Lit before permanence; never publish plaintext in manifests. */
  keyHex: string;
};

/** Encrypt bytes with ChaCha20-Poly1305 (AEAD). Vision doc cites XChaCha20-Poly1305; Node ships IETF ChaCha20-Poly1305. */
export function encryptBuffer(plaintext: Buffer, key?: Buffer): EncryptedBlob {
  const k = key ?? randomBytes(32);
  if (k.length !== 32) throw new Error("ChaCha20-Poly1305 key must be 32 bytes");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("chacha20-poly1305", k, nonce, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([enc, tag]);
  return {
    algorithm: "chacha20-poly1305",
    nonceHex: nonce.toString("hex"),
    ciphertextHex: ciphertext.toString("hex"),
    keyHex: k.toString("hex"),
  };
}

export function decryptBuffer(blob: Omit<EncryptedBlob, "keyHex"> & { keyHex: string }): Buffer {
  const k = Buffer.from(blob.keyHex, "hex");
  const nonce = Buffer.from(blob.nonceHex, "hex");
  const raw = Buffer.from(blob.ciphertextHex, "hex");
  if (raw.length < 16) throw new Error("ciphertext too short");
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const decipher = createDecipheriv("chacha20-poly1305", k, nonce, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function fsError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** Encrypt a file to path (Effect-primary). */
export function encryptFileToPathEffect(
  srcPath: string,
  destPath: string,
  key?: Buffer
): Effect.Effect<EncryptedBlob, Error> {
  return Effect.tryPromise({
    try: async () => {
      const plaintext = await readFile(srcPath);
      const blob = encryptBuffer(plaintext, key);
      await writeFile(destPath, Buffer.from(blob.ciphertextHex, "hex"));
      return blob;
    },
    catch: fsError,
  });
}

/** Promise façade for callers that still await file encryption. */
export async function encryptFileToPath(
  srcPath: string,
  destPath: string,
  key?: Buffer
): Promise<EncryptedBlob> {
  return Effect.runPromise(encryptFileToPathEffect(srcPath, destPath, key));
}

/** Decrypt a file from path (Effect-primary). */
export function decryptFileFromPathEffect(
  encPath: string,
  destPath: string,
  blob: { algorithm: "chacha20-poly1305"; nonceHex: string; keyHex: string }
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: async () => {
      const ciphertext = await readFile(encPath);
      const plain = decryptBuffer({
        algorithm: blob.algorithm,
        nonceHex: blob.nonceHex,
        ciphertextHex: ciphertext.toString("hex"),
        keyHex: blob.keyHex,
      });
      await writeFile(destPath, plain);
    },
    catch: fsError,
  });
}

/** Promise façade for callers that still await file decryption. */
export async function decryptFileFromPath(
  encPath: string,
  destPath: string,
  blob: { algorithm: "chacha20-poly1305"; nonceHex: string; keyHex: string }
): Promise<void> {
  return Effect.runPromise(decryptFileFromPathEffect(encPath, destPath, blob));
}
