import { randomBytes } from "node:crypto";
import { Effect } from "effect";
import { CallbackEndpointError } from "./errors.js";

const WHSEC_PREFIX = "whsec_";

/**
 * Validate Standard Webhooks secret: `whsec_` + base64 of 24–64 bytes.
 */
export function validateWhsecSecret(secret: string): Effect.Effect<string, CallbackEndpointError> {
  return Effect.try({
    try: () => {
      const s = secret.trim();
      if (!s.startsWith(WHSEC_PREFIX)) {
        throw new Error("Signing secret must start with whsec_");
      }
      const b64 = s.slice(WHSEC_PREFIX.length);
      const buf = Buffer.from(b64, "base64");
      if (buf.byteLength < 24 || buf.byteLength > 64) {
        throw new Error("Signing secret must decode to 24–64 bytes");
      }
      return s;
    },
    catch: (e) =>
      new CallbackEndpointError({
        message: e instanceof Error ? e.message : String(e),
        reason: "invalid_secret",
      }),
  });
}

/** Generate a test/dev `whsec_` secret (32 random bytes). */
export function generateWhsecSecret(): Effect.Effect<string> {
  return Effect.sync(() => `${WHSEC_PREFIX}${randomBytes(32).toString("base64")}`);
}

export function generateWhsecSecretSync(): string {
  return `${WHSEC_PREFIX}${randomBytes(32).toString("base64")}`;
}
