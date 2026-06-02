import { createHash } from "node:crypto";

/** SHA-256 hex digest of a UTF-8 string (vault body hashing, chunk ids, etc.). */
export function sha256HexUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
