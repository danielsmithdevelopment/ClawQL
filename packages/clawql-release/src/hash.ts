import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha256FileHex(absPath: string): Promise<{ hex: string; sizeBytes: number }> {
  const buf = await readFile(absPath);
  const hex = createHash("sha256").update(buf).digest("hex");
  return { hex, sizeBytes: buf.length };
}

export function sha256Utf8Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function normalizeDigest(digest: string): string {
  const d = digest.trim();
  return d.startsWith("sha256:") ? d.slice("sha256:".length) : d;
}
