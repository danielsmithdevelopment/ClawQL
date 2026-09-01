/**
 * Phase 4 — team/org offboarding: revoke issued API keys for a subject (and optional team).
 * Effect-primary. Payments owns membership; clawql-auth owns credential revoke.
 */

import { Effect } from "effect";

import type { AuthEventSink } from "../audit/auth-events.js";
import { emitAuthEventEffect } from "../audit/auth-events.js";
import { ApiKeyStoreError, type IssuedApiKeyStore } from "../api-keys/store.js";
import type { SecretStore } from "../stores/types.js";

export type OffboardSubjectInput = {
  orgId: string;
  subjectId: string;
  /** When set, only revoke keys for this team. */
  teamId?: string;
  /** Also mark outbound OAuth providers as needing re-auth (provider ids). */
  oauthProviderIds?: string[];
};

export type OffboardSubjectResult = {
  revokedKeyIds: string[];
  oauthMarked: string[];
};

/**
 * Revoke all active issued API keys for `subjectId` within `orgId` (optional team filter).
 * Optionally marks outbound OAuth tokens as `needs_reauth`.
 */
export function offboardSubjectEffect(
  apiKeys: IssuedApiKeyStore,
  input: OffboardSubjectInput,
  options: {
    secretStore?: SecretStore;
    eventSink?: AuthEventSink;
  } = {}
): Effect.Effect<OffboardSubjectResult, ApiKeyStoreError> {
  return Effect.gen(function* () {
    const active = yield* apiKeys.listActive({
      orgId: input.orgId,
      teamId: input.teamId,
    });
    const targets = active.filter((k) => k.subjectId === input.subjectId);
    const revokedKeyIds: string[] = [];
    for (const key of targets) {
      const revoked = yield* apiKeys.revoke(key.id);
      if (revoked) revokedKeyIds.push(revoked.id);
    }

    const oauthMarked: string[] = [];
    if (options.secretStore && input.oauthProviderIds?.length) {
      for (const providerId of input.oauthProviderIds) {
        yield* options.secretStore
          .markRequiresReauth(providerId)
          .pipe(Effect.catchAll(() => Effect.void));
        oauthMarked.push(providerId);
        yield* emitAuthEventEffect(options.eventSink, {
          type: "OAUTH_REAUTH_REQUIRED",
          providerId,
          tokenKey: providerId,
          reason: "offboard",
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { revokedKeyIds, oauthMarked };
  });
}
