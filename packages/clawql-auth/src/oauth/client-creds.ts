/**
 * Outbound OAuth Client Credentials (machine-to-machine).
 * Preferred when no user identity is required — no refresh token; re-issue on expiry.
 */

import { Data } from "effect";

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

export class ClientCredentialsFlow {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getToken(config: ClientCredentialsConfig): Promise<StoredOAuthToken> {
    const fetchFn = config.fetchImpl ?? this.fetchImpl;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...(config.scope?.length ? { scope: config.scope.join(" ") } : {}),
      ...config.extraParams,
    });

    let response: Response;
    try {
      response = await fetchFn(config.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (cause) {
      throw new OAuthFlowError({
        reason: `Client credentials token request failed: ${String(cause)}`,
        cause,
      });
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      throw new OAuthFlowError({
        reason: `Client credentials token request failed: ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
        status: response.status,
      });
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
      error?: string;
    };

    if (data.error || !data.access_token) {
      throw new OAuthFlowError({
        reason: `Token response error: ${data.error ?? "missing access_token"}`,
      });
    }

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
    return {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + expiresIn * 1000,
      scope: data.scope ?? config.scope?.join(" "),
      tokenType: data.token_type ?? "Bearer",
      refreshToken: undefined,
    };
  }
}

export function createClientCredentialsFlow(
  fetchImpl?: typeof fetch
): ClientCredentialsFlow {
  return new ClientCredentialsFlow(fetchImpl);
}
