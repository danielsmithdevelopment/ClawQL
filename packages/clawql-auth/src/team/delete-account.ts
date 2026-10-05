/**
 * Account deletion / offboard gated by RecentSignIn (gdp-ts).
 */

import { Effect } from "effect";
import type { Named, UserId } from "clawql-gdp";

import type { AuthEventSink } from "../audit/auth-events.js";
import { ApiKeyStoreError, type IssuedApiKeyStore } from "../api-keys/store.js";
import type { RecentSignIn } from "../proofs/recent-sign-in.js";
import type { SecretStore } from "../stores/types.js";
import {
  offboardSubjectEffect,
  type OffboardSubjectInput,
  type OffboardSubjectResult,
} from "./offboard.js";

export type DeleteAccountInput = OffboardSubjectInput;

/**
 * Sensitive: revokes credentials for a subject. Demands RecentSignIn about the
 * exact named user (gdp-ts). `user.value` must equal `input.subjectId`.
 */
export function deleteAccountEffect<U>(
  user: Named<U, UserId>,
  _proof: RecentSignIn<U>,
  apiKeys: IssuedApiKeyStore,
  input: DeleteAccountInput,
  options: {
    secretStore?: SecretStore;
    eventSink?: AuthEventSink;
  } = {}
): Effect.Effect<OffboardSubjectResult, ApiKeyStoreError> {
  return Effect.gen(function* () {
    if (user.value !== input.subjectId.trim()) {
      return yield* Effect.fail(
        new ApiKeyStoreError({
          reason: "Named user does not match deleteAccount subjectId",
        })
      );
    }
    return yield* offboardSubjectEffect(apiKeys, input, options);
  });
}
