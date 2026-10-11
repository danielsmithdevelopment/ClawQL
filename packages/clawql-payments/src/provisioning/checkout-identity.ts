/**
 * Self-serve Checkout identity: verify Supabase JWT on the server and bind
 * an internal ClawQL user. Never trusts a client-supplied supabaseUserId.
 */

import { IdentityStoreService, identityStoreLiveLayer, type ClawqlUserRecord } from "clawql-auth";
import { Effect, Layer } from "effect";
import {
  supabasePluginEnabled,
  SupabaseAuthService,
  SupabaseAuthServiceLive,
  type SupabaseSessionClaims,
} from "clawql-supabase";

export type CheckoutSessionIdentity = {
  readonly claims: SupabaseSessionClaims;
  readonly user: ClawqlUserRecord;
};

export const supabaseSelfServeCheckoutEnabledEffect = (
  env: NodeJS.ProcessEnv
): Effect.Effect<boolean> => Effect.sync(() => supabasePluginEnabled(env));

export const resolveCheckoutSessionIdentityEffect = (
  accessToken: string,
  env: NodeJS.ProcessEnv,
  ownerEmail?: string
): Effect.Effect<CheckoutSessionIdentity, Error> =>
  Effect.gen(function* () {
    const auth = yield* SupabaseAuthService;
    const identities = yield* IdentityStoreService;
    const claims = yield* auth.verifyAccessToken(accessToken, env, { privileged: true });
    const user = yield* identities.getOrCreateFromLinkedIdentity({
      provider: "supabase",
      subject: claims.sub,
      email: claims.email ?? ownerEmail,
    });
    return { claims, user };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof Error
        ? cause
        : new Error(
            cause && typeof cause === "object" && "reason" in cause
              ? String((cause as { reason: string }).reason)
              : "session verification failed"
          )
    )
  );

export const resolveExistingSessionIdentityEffect = (
  accessToken: string,
  env: NodeJS.ProcessEnv
): Effect.Effect<CheckoutSessionIdentity, Error> =>
  Effect.gen(function* () {
    const auth = yield* SupabaseAuthService;
    const identities = yield* IdentityStoreService;
    const claims = yield* auth.verifyAccessToken(accessToken, env, { privileged: true });
    const user = yield* identities.getByLinkedIdentity("supabase", claims.sub);
    if (!user) {
      return yield* Effect.fail(new Error("unknown ClawQL user"));
    }
    yield* auth.assertRecentAuthentication(claims, { env });
    return { claims, user };
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof Error
        ? cause
        : new Error(
            cause && typeof cause === "object" && "reason" in cause
              ? String((cause as { reason: string }).reason)
              : "session verification failed"
          )
    )
  );

export const checkoutIdentityLayer = (
  env: NodeJS.ProcessEnv
): Layer.Layer<SupabaseAuthService | IdentityStoreService> =>
  Layer.merge(SupabaseAuthServiceLive, identityStoreLiveLayer(env));
