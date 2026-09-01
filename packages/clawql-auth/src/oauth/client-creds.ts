/**
 * Outbound OAuth Client Credentials (machine-to-machine).
 * Preferred when no user identity is required — no refresh token; re-issue on expiry.
 */

import { Context, Data, Effect, Layer } from "effect";

import type { StoredOAuthToken } from "./types.js";

export class OAuthFlowError extends Data.TaggedError("OAuthFlowError")<{
  readonly reason: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

export type ClientCredentialsConfig = {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  scope?: string[];
  /** Extra form fields (e.g. resource, audience). */
  extraParams?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class ClientCredentialsFlow {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  getToken(config: ClientCredentialsConfig): Effect.Effect<StoredOAuthToken, OAuthFlowError> {
    return Effect.gen(this, function* () {
      const fetchFn = config.fetchImpl ?? this.fetchImpl;
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...(config.scope?.length ? { scope: config.scope.join(" ") } : {}),
        ...config.extraParams,
      });

      const response = yield* Effect.tryPromise({
        try: () =>
          fetchFn(config.tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          }),
        catch: (cause) =>
          new OAuthFlowError({
            reason: `Client credentials token request failed: ${errMsg(cause)}`,
            cause,
          }),
      });

      if (!response.ok) {
        const detail = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => undefined,
        }).pipe(Effect.catchAll(() => Effect.succeed("")));
        return yield* Effect.fail(
          new OAuthFlowError({
            reason: `Client credentials token request failed: ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
            status: response.status,
          })
        );
      }

      const data = yield* Effect.tryPromise({
        try: () =>
          response.json() as Promise<{
            access_token?: string;
            expires_in?: number;
            scope?: string;
            token_type?: string;
            error?: string;
          }>,
        catch: (cause) =>
          new OAuthFlowError({ reason: `Invalid token response JSON: ${errMsg(cause)}`, cause }),
      });

      if (data.error || !data.access_token) {
        return yield* Effect.fail(
          new OAuthFlowError({
            reason: `Token response error: ${data.error ?? "missing access_token"}`,
          })
        );
      }

      const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
      return {
        accessToken: data.access_token,
        expiresAtMs: Date.now() + expiresIn * 1000,
        scope: data.scope ?? config.scope?.join(" "),
        tokenType: data.token_type ?? "Bearer",
        refreshToken: undefined,
      } satisfies StoredOAuthToken;
    });
  }
}

export function createClientCredentialsFlow(fetchImpl?: typeof fetch): ClientCredentialsFlow {
  return new ClientCredentialsFlow(fetchImpl);
}

export class ClientCredentialsFlowService extends Context.Tag(
  "clawql/ClientCredentialsFlowService"
)<
  ClientCredentialsFlowService,
  {
    readonly getToken: (
      config: ClientCredentialsConfig
    ) => Effect.Effect<StoredOAuthToken, OAuthFlowError>;
  }
>() {}

export function clientCredentialsFlowServiceFromFlow(
  flow: ClientCredentialsFlow
): ClientCredentialsFlowService["Type"] {
  return ClientCredentialsFlowService.of({
    getToken: (config) => flow.getToken(config),
  });
}

/** Build an isolated client-credentials flow service layer. */
export function createClientCredentialsFlowLayer(
  fetchImpl?: typeof fetch
): Layer.Layer<ClientCredentialsFlowService> {
  return Layer.succeed(
    ClientCredentialsFlowService,
    clientCredentialsFlowServiceFromFlow(createClientCredentialsFlow(fetchImpl))
  );
}
