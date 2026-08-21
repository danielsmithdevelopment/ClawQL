/**
 * Authorization Code + PKCE (user-delegated outbound OAuth).
 * Verifier/state live in injectable persistence (vault / memory) — never agent env.
 */

import { createHash, randomBytes } from "node:crypto";
import { Data } from "effect";

import {
  emitAuthEvent,
  noopAuthEventSink,
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

export type AuthFlowPersistence = {
  storeFlowState: (state: string, data: AuthFlowState) => Promise<void>;
  getFlowState: (state: string) => Promise<AuthFlowState | null>;
  deleteFlowState: (state: string) => Promise<void>;
  setOAuthToken: (providerId: string, token: StoredOAuthToken) => Promise<void>;
};

export type AuthFlowStart = {
  authorizationUrl: string;
  state: string;
};

export class AuthCodeError extends Data.TaggedError("AuthCodeError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("base64url");
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

  async startFlow(config: AuthCodeConfig): Promise<AuthFlowStart> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateOAuthState();

    await this.options.persistence.storeFlowState(state, {
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
  }

  async handleCallback(
    code: string,
    state: string,
    config?: Partial<AuthCodeConfig>
  ): Promise<StoredOAuthToken> {
    const flowState = await this.options.persistence.getFlowState(state);
    if (!flowState) {
      throw new AuthCodeError({ reason: "INVALID_STATE" });
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

    let response: Response;
    try {
      response = await fetchFn(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (cause) {
      throw new OAuthFlowError({
        reason: `Authorization code exchange failed: ${String(cause)}`,
        cause,
      });
    }

    if (!response.ok) {
      throw new OAuthFlowError({
        reason: `Authorization code exchange failed: ${response.status}`,
        status: response.status,
      });
    }

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      error?: string;
    };

    if (data.error || !data.access_token) {
      throw new OAuthFlowError({
        reason: `Token exchange error: ${data.error ?? "missing access_token"}`,
      });
    }

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
    const tokenSet: StoredOAuthToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAtMs: this.now() + expiresIn * 1000,
      scope: data.scope ?? flowState.scope.join(" "),
      tokenType: data.token_type ?? "Bearer",
    };

    await this.options.persistence.setOAuthToken(flowState.providerId, tokenSet);
    await this.options.persistence.deleteFlowState(state);

    await emitAuthEvent(this.eventSink, {
      type: "OAUTH_AUTHORIZATION_COMPLETED",
      providerId: flowState.providerId,
      scope: tokenSet.scope?.split(/\s+/).filter(Boolean) ?? flowState.scope,
      expiresAt: new Date(tokenSet.expiresAtMs).toISOString(),
      timestamp: new Date(this.now()).toISOString(),
    });

    return tokenSet;
  }
}

export function createAuthorizationCodeFlow(
  options: AuthorizationCodeFlowOptions
): AuthorizationCodeFlow {
  return new AuthorizationCodeFlow(options);
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
    async storeFlowState(state, data) {
      flows.set(state, data);
    },
    async getFlowState(state) {
      return flows.get(state) ?? null;
    },
    async deleteFlowState(state) {
      flows.delete(state);
    },
    async setOAuthToken(providerId, token) {
      tokens.set(providerId, token);
    },
  };
}
