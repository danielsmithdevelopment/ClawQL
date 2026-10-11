/**
 * Trusted module: mint VerifiedCheckoutSessionUser.
 * Only a verified Supabase (or equivalent) session may bind a user id into checkout metadata.
 */

import { defineProof, type Named, type Proof, type UserId } from "clawql-gdp";
import { Effect } from "effect";

const VerifiedCheckoutSessionUserProver = defineProof("VerifiedCheckoutSessionUser");

export interface VerifiedCheckoutSessionUser<U> extends Proof<"VerifiedCheckoutSessionUser", [U]> {
  /** Nominal brand for distinct proof kinds; never set at runtime. */
  readonly __proofBrand?: "VerifiedCheckoutSessionUser";
}

export type VerifiedSessionClaims = {
  readonly sub: string;
};

/**
 * Mint a proof that `user` is exactly the subject of **already-verified**
 * session claims. Call this only inside the session-verify success path
 * (e.g. immediately after `SupabaseAuthService.verifyAccessToken`) — never
 * with client-supplied ids. The verify step is the real check; this prover
 * binds that check to the named user.
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
