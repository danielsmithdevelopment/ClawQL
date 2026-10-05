/**
 * Trusted module: mint VerifiedCheckoutSessionUser.
 * Only a verified Supabase (or equivalent) session may bind a user id into checkout metadata.
 */

import { defineProof, type Named, type Proof, type UserId } from "clawql-gdp";
import { Effect } from "effect";

const VerifiedCheckoutSessionUserProver = defineProof("VerifiedCheckoutSessionUser");

export interface VerifiedCheckoutSessionUser<U> extends Proof<"VerifiedCheckoutSessionUser", [U]> {}

export type VerifiedSessionClaims = {
  readonly sub: string;
};

/**
 * Mint a proof that `user` is exactly the subject of verified session claims.
 * Callers must verify the JWT/session before invoking this (e.g. SupabaseAuthService).
 */
export function verifiedCheckoutSessionUserEffect<U>(
  user: Named<U, UserId>,
  claims: VerifiedSessionClaims
): Effect.Effect<VerifiedCheckoutSessionUser<U> | null> {
  return Effect.sync(() => {
    const sub = claims.sub?.trim();
    if (!sub || sub !== user.value) return null;
    return VerifiedCheckoutSessionUserProver.prove(user) as VerifiedCheckoutSessionUser<U>;
  });
}
