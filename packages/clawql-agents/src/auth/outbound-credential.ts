/**
 * Single entry point for Hermes/Cline outbound credentials before MCP execute.
 * Agents must not implement provider-specific refresh — delegate to OAuthTokenStore.
 */

import {
  OutboundAPIKeyManager,
  OutboundApiKeyError,
  PROVIDER_AUTH_METHOD,
  ReauthRequiredError,
  type OAuthTokenStore,
  type OutboundAuthMethod,
} from "clawql-auth";
import { Data, Effect } from "effect";

export type OutboundCredential =
  | { readonly kind: "bearer"; readonly token: string }
  | { readonly kind: "headers"; readonly headers: Readonly<Record<string, string>> }
  | { readonly kind: "reauth_required"; readonly error: ReauthRequiredError };

export class OutboundCredentialError extends Data.TaggedError("OutboundCredentialError")<{
  readonly reason: string;
  readonly provider: string;
  readonly cause?: unknown;
}> {}

export type GetOutboundCredentialInput = {
  readonly tenantId: string;
  readonly subject: string;
  readonly provider: string;
  readonly tokenStore: OAuthTokenStore;
  readonly apiKeys: OutboundAPIKeyManager;
  /** Override PROVIDER_AUTH_METHOD lookup (tests / custom providers). */
  readonly authMethod?: OutboundAuthMethod;
  /** Session / virtual-key id for API key audit attribution. */
  readonly sessionId?: string;
};

const resolveMethod = (provider: string, override?: OutboundAuthMethod): OutboundAuthMethod => {
  if (override) return override;
  return PROVIDER_AUTH_METHOD[provider] ?? "api_key";
};

/**
 * Resolve outbound credentials for a provider execute path.
 * Returns `reauth_required` instead of throwing when OAuth needs operator consent.
 */
export const getOutboundCredential = (
  input: GetOutboundCredentialInput
): Effect.Effect<OutboundCredential, OutboundCredentialError | OutboundApiKeyError> =>
  Effect.gen(function* () {
    const method = resolveMethod(input.provider, input.authMethod);

    if (method === "oauth_code" || method === "oauth_client_credentials") {
      const key = `${input.tenantId}:${input.provider}:${input.subject}`;
      const result = yield* Effect.tryPromise({
        try: () => input.tokenStore.getValidToken(key),
        catch: (err) => err,
      }).pipe(Effect.either);

      if (result._tag === "Left") {
        const err = result.left;
        if (
          err instanceof ReauthRequiredError ||
          (err as { _tag?: string })?._tag === "ReauthRequiredError"
        ) {
          return {
            kind: "reauth_required" as const,
            error: err as ReauthRequiredError,
          };
        }
        return yield* Effect.fail(
          new OutboundCredentialError({
            reason: err instanceof Error ? err.message : String(err),
            provider: input.provider,
            cause: err,
          })
        );
      }

      return { kind: "bearer" as const, token: result.right.accessToken };
    }

    if (method === "api_key") {
      const apiKey = yield* Effect.tryPromise({
        try: () => input.apiKeys.getKey(input.provider, input.sessionId ?? input.subject),
        catch: (err) => {
          if (err instanceof OutboundApiKeyError) return err;
          return new OutboundCredentialError({
            reason: err instanceof Error ? err.message : String(err),
            provider: input.provider,
            cause: err,
          });
        },
      });
      return {
        kind: "headers" as const,
        headers: { Authorization: `Bearer ${apiKey}` },
      };
    }

    // vault_dynamic / unknown — host supplies SigV4 or dynamic lease outside this helper
    const emptyHeaders: Readonly<Record<string, string>> = {};
    return { kind: "headers" as const, headers: emptyHeaders };
  });
