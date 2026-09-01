/**
 * Layer C — pluggable ID-JAG assertion signer (TEE / local jose).
 * Real clawql-tee package is optional; inject a TEE-backed signer when available.
 */

import { Effect } from "effect";
import { SignJWT, type JWTPayload } from "jose";

import type { IdJagIssuerError } from "./id-jag-issuer.js";
import { IdJagIssuerError as IdJagErr } from "./id-jag-issuer.js";
import type { McpOAuthSigningMaterial } from "./mcp-oauth-signing.js";

export type IdJagSignRequest = {
  claims: JWTPayload;
  header: { alg: string; kid?: string; typ?: string };
};

/** Pluggable signer — TEE implementations wrap attestation-gated key ops. */
export type IdJagAssertionSigner = {
  readonly kind: "local" | "tee";
  sign: (request: IdJagSignRequest) => Effect.Effect<string, IdJagIssuerError>;
};

/** Local jose signer (Layers A/B default). */
export function createLocalIdJagAssertionSigner(
  signing: McpOAuthSigningMaterial
): IdJagAssertionSigner {
  return {
    kind: "local",
    sign: (request) =>
      Effect.tryPromise({
        try: () =>
          new SignJWT(request.claims)
            .setProtectedHeader({
              alg: request.header.alg,
              ...(request.header.kid ? { kid: request.header.kid } : {}),
              ...(request.header.typ ? { typ: request.header.typ } : {}),
            })
            .sign(signing.signKey),
        catch: (cause) =>
          new IdJagErr({
            reason: cause instanceof Error ? cause.message : "sign_failed",
            cause,
          }),
      }),
  };
}

/**
 * TEE-shaped signer façade — delegates to an injected Effect that performs
 * attested signing (clawql-tee / Vault transit / HSM). Used when
 * `CLAWQL_ID_JAG_TEE_SIGNER=1` and the host provides `teeSign`.
 */
export function createTeeIdJagAssertionSigner(input: {
  teeSign: (request: IdJagSignRequest) => Effect.Effect<string, unknown>;
}): IdJagAssertionSigner {
  return {
    kind: "tee",
    sign: (request) =>
      input.teeSign(request).pipe(
        Effect.mapError(
          (cause) =>
            new IdJagErr({
              reason: cause instanceof Error ? cause.message : "tee_sign_failed",
              cause,
            })
        )
      ),
  };
}
