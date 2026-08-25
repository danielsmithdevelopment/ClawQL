/**
 * Authorization Code + PKCE (user-delegated outbound OAuth).
 * Verifier/state live in injectable persistence (vault / memory) — never agent env.
 *
 * Effect is the primary surface: {@link generateCodeVerifierEffect} / {@link generateCodeChallengeEffect}
 * / {@link generateOAuthStateEffect} for the PKCE primitives, and {@link AuthorizationCodeFlowService} +
 * {@link createAuthorizationCodeFlowLayer} for the flow (mirrors {@link GatewayAuthService} /
 * {@link IdJagIssuerService}).
 *
 * `generateCodeVerifier` / `generateCodeChallenge` stay exported as plain sync functions (not
 * re-exported from the package entry) because `inbound/mcp-oauth.ts` — owned by another agent in
 * this workspace — imports them directly by file path; only `generateOAuthState` is fully
 * module-internal.
 */

import { createHash, randomBytes } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEvent,
  type AuthEventSink,
} from "../audit/auth-events.js";
import { OAuthFlowError } from "./client-creds.js";
import type { StoredOAuthToken } from "./types.js";

export type AuthCodeConfig = {
  providerId: string;
  authEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string[];
  fetchImpl?: typeof fetch;
};

export type AuthFlowState = {
  codeVerifier: string;
  providerId: string;
  scope: string[];
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  createdAtMs: number;
};

/** Host-injected PKCE state + token persistence. Effect-primary. */
export type AuthFlowPersistence = {
  storeFlowState: (state: string, data: AuthFlowState) => Effect.Effect<void, unknown>;
  getFlowState: (state: string) => Effect.Effect<AuthFlowState | null, unknown>;
  deleteFlowState: (state: string) => Effect.Effect<void, unknown>;
  setOAuthToken: (providerId: string, token: StoredOAuthToken) => Effect.Effect<void, unknown>;
};

export type AuthFlowStart = {
  authorizationUrl: string;
  state: string;
};

export class AuthCodeError extends Data.TaggedError("AuthCodeError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Kept as a plain sync export — prefer {@link generateCodeVerifierEffect}. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** Kept as a plain sync export — prefer {@link generateCodeChallengeEffect}. */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

/** Effect: generate a PKCE code verifier. */
export const generateCodeVerifierEffect = (): Effect.Effect<string> =>
  Effect.sync(generateCodeVerifier);

/** Effect: derive the S256 PKCE code challenge from a verifier. */
export const generateCodeChallengeEffect = (verifier: string): Effect.Effect<string> =>
  Effect.sync(() => generateCodeChallenge(verifier));

/** Effect: generate an opaque OAuth `state` value. */
export const generateOAuthStateEffect = (): Effect.Effect<string> =>
  Effect.sync(generateOAuthState);

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function emitEffect(sink: AuthEventSink, event: AuthEvent): Effect.Effect<void> {
  return emitAuthEventEffect(sink, event);
}

export type AuthorizationCodeFlowOptions = {
  persistence: AuthFlowPersistence;
  eventSink?: AuthEventSink;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export class AuthorizationCodeFlow {
  private readonly eventSink: AuthEventSink;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: AuthorizationCodeFlowOptions) {
    this.eventSink = options.eventSink ?? noopAuthEventSink;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  startFlow(config: AuthCodeConfig): Effect.Effect<AuthFlowStart, unknown> {
    return Effect.gen(this, function* () {
      const codeVerifier = yield* generateCodeVerifierEffect();
      const codeChallenge = yield* generateCodeChallengeEffect(codeVerifier);
      const state = yield* generateOAuthStateEffect();

      yield* this.options.persistence.storeFlowState(state, {
        codeVerifier,
        providerId: config.providerId,
        scope: [...config.scope],
        redirectUri: config.redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tokenEndpoint: config.tokenEndpoint,
        createdAtMs: this.now(),
      });

      const url = new URL(config.authEndpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("scope", config.scope.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");

      return { authorizationUrl: url.toString(), state };
    });
  }

  handleCallback(
    code: string,
    state: string,
    config?: Partial<AuthCodeConfig>
  ): Effect.Effect<StoredOAuthToken, AuthCodeError | OAuthFlowError | unknown> {
    return Effect.gen(this, function* () {
      const flowState = yield* this.options.persistence.getFlowState(state);
      if (!flowState) {
        return yield* Effect.fail(new AuthCodeError({ reason: "INVALID_STATE" }));
      }

      const tokenEndpoint = config?.tokenEndpoint ?? flowState.tokenEndpoint;
      const clientId = config?.clientId ?? flowState.clientId;
      const clientSecret = config?.clientSecret ?? flowState.clientSecret;
      const redirectUri = config?.redirectUri ?? flowState.redirectUri;
      const fetchFn = config?.fetchImpl ?? this.fetchImpl;

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: flowState.codeVerifier,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      });

      const response = yield* Effect.tryPromise({
        try: () =>
          fetchFn(tokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          }),
        catch: (cause) =>
          new OAuthFlowError({
            reason: `Authorization code exchange failed: ${errMsg(cause)}`,
            cause,
          }),
      });

      if (!response.ok) {
        return yield* Effect.fail(
          new OAuthFlowError({
            reason: `Authorization code exchange failed: ${response.status}`,
            status: response.status,
          })
        );
      }

      const data = yield* Effect.tryPromise({
        try: () =>
          response.json() as Promise<{
            access_token?: string;
            refresh_token?: string;
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
            reason: `Token exchange error: ${data.error ?? "missing access_token"}`,
          })
        );
      }

      const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
      const tokenSet: StoredOAuthToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAtMs: this.now() + expiresIn * 1000,
        scope: data.scope ?? flowState.scope.join(" "),
        tokenType: data.token_type ?? "Bearer",
      };

      yield* this.options.persistence.setOAuthToken(flowState.providerId, tokenSet);
      yield* this.options.persistence.deleteFlowState(state);

      yield* emitEffect(this.eventSink, {
        type: "OAUTH_AUTHORIZATION_COMPLETED",
        providerId: flowState.providerId,
        scope: tokenSet.scope?.split(/\s+/).filter(Boolean) ?? flowState.scope,
        expiresAt: new Date(tokenSet.expiresAtMs).toISOString(),
        timestamp: new Date(this.now()).toISOString(),
      });

      return tokenSet;
    });
  }
}

export function createAuthorizationCodeFlow(
  options: AuthorizationCodeFlowOptions
): AuthorizationCodeFlow {
  return new AuthorizationCodeFlow(options);
}

export class AuthorizationCodeFlowService extends Context.Tag(
  "clawql/AuthorizationCodeFlowService"
)<
  AuthorizationCodeFlowService,
  {
    readonly startFlow: (config: AuthCodeConfig) => Effect.Effect<AuthFlowStart, unknown>;
    readonly handleCallback: (
      code: string,
      state: string,
      config?: Partial<AuthCodeConfig>
    ) => Effect.Effect<StoredOAuthToken, AuthCodeError | OAuthFlowError | unknown>;
  }
>() {}

export function authorizationCodeFlowServiceFromFlow(
  flow: AuthorizationCodeFlow
): AuthorizationCodeFlowService["Type"] {
  return AuthorizationCodeFlowService.of({
    startFlow: (config) => flow.startFlow(config),
    handleCallback: (code, state, config) => flow.handleCallback(code, state, config),
  });
}

/** Build an isolated authorization-code flow service layer. */
export function createAuthorizationCodeFlowLayer(
  options: AuthorizationCodeFlowOptions
): Layer.Layer<AuthorizationCodeFlowService> {
  return Layer.succeed(
    AuthorizationCodeFlowService,
    authorizationCodeFlowServiceFromFlow(createAuthorizationCodeFlow(options))
  );
}

/** In-memory PKCE + token persistence for tests. */
export function createMemoryAuthFlowPersistence(): AuthFlowPersistence & {
  readonly flows: Map<string, AuthFlowState>;
  readonly tokens: Map<string, StoredOAuthToken>;
} {
  const flows = new Map<string, AuthFlowState>();
  const tokens = new Map<string, StoredOAuthToken>();
  return {
    flows,
    tokens,
    storeFlowState: (state, data) =>
      Effect.sync(() => {
        flows.set(state, data);
      }),
    getFlowState: (state) => Effect.sync(() => flows.get(state) ?? null),
    deleteFlowState: (state) =>
      Effect.sync(() => {
        flows.delete(state);
      }),
    setOAuthToken: (providerId, token) =>
      Effect.sync(() => {
        tokens.set(providerId, token);
      }),
  };
}
