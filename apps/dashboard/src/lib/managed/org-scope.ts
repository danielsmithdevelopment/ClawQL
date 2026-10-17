/**
 * Trusted org resolution for managed console APIs.
 * Client-supplied `orgId` (body/query) must match the session/env org or the request is rejected —
 * classic IDOR / tenant-spoof guard for live-shaped routes.
 */
import { Context, Data, Effect, Layer } from "effect";

import { managedOrgId } from "@/lib/managed/data-source";

export class OrgScopeError extends Data.TaggedError("OrgScopeError")<{
  readonly reason: "org_spoof" | "org_missing";
  readonly detail?: string;
}> {}

export type ResolveTrustedOrgInput = {
  /** Org bound to the authenticated session (or mock). */
  readonly sessionOrgId: string;
  /** Optional client-claimed org from body or query — rejected when it differs. */
  readonly clientOrgId?: string | null;
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Prefer explicit managed org env, else session org.
 * Fails when the client claims a different orgId than the trusted value.
 */
export const resolveTrustedOrgIdEffect = (
  input: ResolveTrustedOrgInput
): Effect.Effect<string, OrgScopeError> =>
  Effect.gen(function* () {
    const env = input.env ?? process.env;
    const fromEnv = managedOrgId(env);
    const trusted = (fromEnv || input.sessionOrgId || "").trim();
    if (!trusted) {
      return yield* Effect.fail(
        new OrgScopeError({ reason: "org_missing", detail: "No session or managed org id" })
      );
    }
    const claimed = input.clientOrgId?.trim();
    if (claimed && claimed !== trusted) {
      return yield* Effect.fail(
        new OrgScopeError({
          reason: "org_spoof",
          detail: "Client orgId does not match session org",
        })
      );
    }
    return trusted;
  });

/** True when a client-supplied org claim would be an IDOR / spoof. */
export const isOrgSpoofAttempt = (input: {
  readonly trustedOrgId: string;
  readonly clientOrgId?: string | null;
}): boolean => {
  const claimed = input.clientOrgId?.trim();
  if (!claimed) return false;
  return claimed !== input.trustedOrgId.trim();
};

export const CLAWQL_ORG_SCOPE_TAG = "clawql/ManagedOrgScope" as const;

export class ManagedOrgScopeService extends Context.Service<
  typeof CLAWQL_ORG_SCOPE_TAG,
  {
    readonly resolveTrustedOrgId: (
      input: ResolveTrustedOrgInput
    ) => Effect.Effect<string, OrgScopeError>;
  }
>()(CLAWQL_ORG_SCOPE_TAG) {}

export const ManagedOrgScopeLive = Layer.succeed(ManagedOrgScopeService, {
  resolveTrustedOrgId: resolveTrustedOrgIdEffect,
});
