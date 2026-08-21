import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import {
  createAuthorizationCodeFlow,
  createMemoryAuthFlowPersistence,
  generateCodeChallenge,
  generateCodeVerifier,
} from "./auth-code.js";
import { ClientCredentialsFlow, OAuthFlowError } from "./client-creds.js";
import { createMemorySecretSource, createOutboundAPIKeyManager } from "./outbound-api-key.js";
import { GOOGLE_OAUTH_CONFIG, PROVIDER_AUTH_METHOD } from "./providers.js";

describe("ClientCredentialsFlow", () => {
  it("exchanges client credentials for an access token", async () => {
    const flow = new ClientCredentialsFlow(async (_url, init) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("grant_type=client_credentials");
      expect(body).toContain("client_id=cid");
      return new Response(
        JSON.stringify({
          access_token: "atok",
          expires_in: 3600,
          scope: "Mail.Read",
          token_type: "Bearer",
        }),
        { status: 200 }
      );
    });

    const token = await flow.getToken({
      tokenEndpoint: "https://example.test/token",
      clientId: "cid",
      clientSecret: "csecret",
      scope: ["Mail.Read"],
    });

    expect(token.accessToken).toBe("atok");
    expect(token.refreshToken).toBeUndefined();
    expect(token.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("surfaces HTTP failures as OAuthFlowError", async () => {
    const flow = new ClientCredentialsFlow(async () => new Response("nope", { status: 401 }));
    await expect(
      flow.getToken({
        tokenEndpoint: "https://example.test/token",
        clientId: "cid",
        clientSecret: "bad",
      })
    ).rejects.toBeInstanceOf(OAuthFlowError);
  });
});

describe("AuthorizationCodeFlow + PKCE", () => {
  it("starts a PKCE flow and exchanges the code", async () => {
    const events: AuthEvent[] = [];
    const persistence = createMemoryAuthFlowPersistence();
    const flow = createAuthorizationCodeFlow({
      persistence,
      eventSink: (e) => {
        events.push(e);
      },
      fetchImpl: async (_url, init) => {
        const body = String(init?.body ?? "");
        expect(body).toContain("grant_type=authorization_code");
        expect(body).toContain("code_verifier=");
        return new Response(
          JSON.stringify({
            access_token: "user-atok",
            refresh_token: "user-rtok",
            expires_in: 3600,
            scope: "openid email",
          }),
          { status: 200 }
        );
      },
    });

    const start = await flow.startFlow({
      providerId: "google",
      authEndpoint: GOOGLE_OAUTH_CONFIG.authEndpoint,
      tokenEndpoint: GOOGLE_OAUTH_CONFIG.tokenEndpoint,
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "http://127.0.0.1:8787/callback",
      scope: GOOGLE_OAUTH_CONFIG.scopes.gmail_read!,
    });

    expect(start.authorizationUrl).toContain("code_challenge=");
    expect(start.authorizationUrl).toContain("code_challenge_method=S256");
    expect(persistence.flows.has(start.state)).toBe(true);

    const token = await flow.handleCallback("auth-code-xyz", start.state);
    expect(token.accessToken).toBe("user-atok");
    expect(token.refreshToken).toBe("user-rtok");
    expect(persistence.tokens.get("google")?.accessToken).toBe("user-atok");
    expect(persistence.flows.has(start.state)).toBe(false);
    expect(events.some((e) => e.type === "OAUTH_AUTHORIZATION_COMPLETED")).toBe(true);
  });

  it("rejects invalid state", async () => {
    const flow = createAuthorizationCodeFlow({
      persistence: createMemoryAuthFlowPersistence(),
    });
    await expect(flow.handleCallback("code", "missing")).rejects.toMatchObject({
      _tag: "AuthCodeError",
      reason: "INVALID_STATE",
    });
  });

  it("S256 challenge is deterministic for a verifier", () => {
    const v = generateCodeVerifier();
    expect(generateCodeChallenge(v)).toBe(generateCodeChallenge(v));
  });
});

describe("OutboundAPIKeyManager + provider matrix", () => {
  it("retrieves provider API keys without caching", async () => {
    const secrets = createMemorySecretSource({
      "vault://clawql/providers/linear/api-key": "lin_xxx",
    });
    const mgr = createOutboundAPIKeyManager({ secrets });
    await expect(mgr.getKey("linear", "sess-1")).resolves.toBe("lin_xxx");
    await expect(mgr.getKey("missing", "sess-1")).rejects.toMatchObject({
      _tag: "OutboundApiKeyError",
    });
  });

  it("maps common providers to preferred methods", () => {
    expect(PROVIDER_AUTH_METHOD.github).toBe("api_key");
    expect(PROVIDER_AUTH_METHOD.google).toBe("oauth_code");
    expect(PROVIDER_AUTH_METHOD.microsoft).toBe("oauth_client_credentials");
  });
});
