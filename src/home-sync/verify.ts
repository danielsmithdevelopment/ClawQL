import { createHash } from "node:crypto";

/** SHA-256 hex digest of a buffer (team sync manifest uses lowercase hex). */
export function sha256HexBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Fail closed when downloaded bytes do not match the remote manifest entry.
 * Used by `sync pull` and golden-host bootstrap before trusting team vault data.
 */
export function assertManifestSha256(path: string, body: Buffer, expectedSha256: string): void {
  const actual = sha256HexBuffer(body);
  if (actual !== expectedSha256) {
    throw new Error(
      `Team sync verification failed for ${path}: manifest expects sha256 ${expectedSha256}, got ${actual}`
    );
  }
}
