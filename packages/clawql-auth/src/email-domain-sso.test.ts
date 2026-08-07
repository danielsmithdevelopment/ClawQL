import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  atrClaimsFromJwtPayload,
  loadOidcAuthConfig,
  resetOidcVerifyCaches,
  verifyOidcBearerToken,
} from "./oidc.js";
import { assertEmailDomainAllowed, extractEmailDomain } from "./policy.js";

describe("company email SSO domain policy", () => {
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

  it("extractEmailDomain parses work emails", () => {
    expect(extractEmailDomain("Intern@Acme.COM")).toBe("acme.com");
    expect(extractEmailDomain("bad")).toBeUndefined();
  });

  it("assertEmailDomainAllowed rejects foreign domains", () => {
    expect(() =>
      assertEmailDomainAllowed(
        { sub: "u", role: "op", scope: [], email: "x@evil.com", emailDomain: "evil.com" },
        { allowedDomains: ["acme.com"] }
      )
    ).toThrow(/not allowed/i);
  });

  it("maps email + hd onto ATR claims", () => {
    const claims = atrClaimsFromJwtPayload({
      sub: "user-1",
      email: "alice@acme.com",
      email_verified: true,
      hd: "acme.com",
    });
    expect(claims.email).toBe("alice@acme.com");
    expect(claims.emailDomain).toBe("acme.com");
    expect(claims.emailVerified).toBe(true);
  });

  it("verifyOidcBearerToken enforces CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS", async () => {
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    stash("CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS");
    stash("CLAWQL_AUTH_OIDC_ISSUER");
    const secret = "test-secret-at-least-32-chars!!";
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = secret;
    process.env.CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS = "acme.com";
    process.env.CLAWQL_AUTH_OIDC_ISSUER = "https://idp.example";

    const config = loadOidcAuthConfig();
    expect(config.allowedEmailDomains).toEqual(["acme.com"]);
    expect(config.requireEmailDomain).toBe(true);

    const key = new TextEncoder().encode(secret);
    const good = await new SignJWT({
      sub: "alice",
      email: "alice@acme.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://idp.example")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);

    const ok = await verifyOidcBearerToken(good, config);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.claims.emailDomain).toBe("acme.com");

    const bad = await new SignJWT({
      sub: "eve",
      email: "eve@other.com",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://idp.example")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);

    const denied = await verifyOidcBearerToken(bad, config);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toMatch(/not allowed/i);
  });
});
