import { Effect } from "effect";
import { verifyBridgeJwtAuthorizationHeader } from "../jwt-gate.js";

export type BridgeJwtVerifyResult = { readonly ok: true };

/** Effect-native JWT authorization verification for the Panguard bridge gate. */
export function verifyAuthorizationHeaderEffect(
  authorization: string | undefined
): Effect.Effect<BridgeJwtVerifyResult, Error> {
  return Effect.tryPromise({
    try: async () => {
      await verifyBridgeJwtAuthorizationHeader(authorization ?? "");
      return { ok: true as const };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}
