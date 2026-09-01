import { Effect } from "effect";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStaticOrgIdpRouter,
  mergeOidcConfigWithRoute,
  verifyOidcBearerTokenWithOrgRoutingEffect,
} from "./org-idp-routing.js";
import { loadOidcAuthConfig, resetOidcVerifyCaches } from "./oidc.js";

describe("per-org IdP routing", () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetOidcVerifyCaches();
  });

  function stash(key: string) {
    if (!(key in prev)) prev[key] = process.env[key];
  }

  it("routes verify to org-specific HS256 secret + domains", async () => {
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    const globalSecret = "global-secret-at-least-32-chars!!!!";
    const acmeSecret = "acme-org-secret-at-least-32-chars!!";
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = globalSecret;

    const router = createStaticOrgIdpRouter([
      {
        orgId: "acme",
        allowedEmailDomains: ["acme.com"],
        issuer: "https://idp.acme.com",
        hs256Secret: acmeSecret,
      },
    ]);

    const key = new TextEncoder().encode(acmeSecret);
    const token = await new SignJWT({
      sub: "alice",
      email: "alice@acme.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://idp.acme.com")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);

    const result = await Effect.runPromise(
      verifyOidcBearerTokenWithOrgRoutingEffect(token, {
        baseConfig: loadOidcAuthConfig(),
        router,
      })
    );
    expect(result.claims.orgId).toBe("acme");
    expect(result.claims.emailDomain).toBe("acme.com");
    expect(result.route?.orgId).toBe("acme");
  });

  it("mergeOidcConfigWithRoute prefers route JWKS/issuer", () => {
    const merged = mergeOidcConfigWithRoute(
      { hs256Secret: "base-secret-at-least-32-chars!!!!!", issuer: "https://global" },
      {
        orgId: "acme",
        allowedEmailDomains: ["acme.com"],
        issuer: "https://idp.acme.com",
        jwksUrl: "https://idp.acme.com/jwks",
      }
    );
    expect(merged.issuer).toBe("https://idp.acme.com");
    expect(merged.jwksUrl).toBe("https://idp.acme.com/jwks");
    expect(merged.allowedEmailDomains).toEqual(["acme.com"]);
  });
});
