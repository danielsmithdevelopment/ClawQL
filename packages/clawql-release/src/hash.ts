import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Effect } from "effect";

/** SHA-256 file digest (Effect-primary). */
export function sha256FileHexEffect(
  absPath: string
): Effect.Effect<{ hex: string; sizeBytes: number }, Error> {
  return Effect.tryPromise({
    try: async () => {
      const buf = await readFile(absPath);
      const hex = createHash("sha256").update(buf).digest("hex");
      return { hex, sizeBytes: buf.length };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade for callers that still await file digests. */
export async function sha256FileHex(absPath: string): Promise<{ hex: string; sizeBytes: number }> {
  return Effect.runPromise(sha256FileHexEffect(absPath));
}

export function sha256Utf8Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function normalizeDigest(digest: string): string {
  const d = digest.trim();
  return d.startsWith("sha256:") ? d.slice("sha256:".length) : d;
}
