import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  atrClaimsFromJwtPayload,
  resetOidcVerifyCaches,
  resolveOidcAtrClaimsFromHeaders,
  verifyOidcBearerToken,
} from "./oidc.js";
import {
  assertToolPolicy,
  claimsHaveMfa,
  isFinancialTool,
  isMfaRequiredForFinancialTools,
} from "./policy.js";
import { createClawQLAuth } from "./create-auth.js";
import {
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeaders,
  resolveAtrClaimsFromHeadersAsync,
  resolveAuthMode,
} from "./gateway.js";
import { createFileStepUpStore, generateTotp, generateTotpSecret, verifyTotp } from "./step-up/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("clawql-auth oidc", () => {
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

  it("resolveAuthMode recognizes oidc", () => {
    stash("CLAWQL_AUTH_MODE");
    process.env.CLAWQL_AUTH_MODE = "oidc";
    expect(resolveAuthMode()).toBe("oidc");
  });

  it("sync resolve rejects oidc (async required)", () => {
    stash("CLAWQL_AUTH_MODE");
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    process.env.CLAWQL_AUTH_MODE = "oidc";
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = "test-secret-at-least-32-chars!!";
    const r = resolveAtrClaimsFromHeaders({}, loadGatewayAuthConfig());
    expect(r.ok).toBe(false);
  });

  it("verifies HS256 JWT and maps atr + acr/amr", async () => {
    stash("CLAWQL_AUTH_MODE");
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    stash("CLAWQL_AUTH_OIDC_ISSUER");
    process.env.CLAWQL_AUTH_MODE = "oidc";
    const secret = "test-secret-at-least-32-chars!!";
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = secret;
    process.env.CLAWQL_AUTH_OIDC_ISSUER = "https://idp.example";

    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      atr: {
        sub: "user-1",
        role: "operator",
        scope: ["execute", "search"],
        tenantId: "acme",
      },
      acr: "mfa",
      amr: ["pwd", "otp"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("https://idp.example")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);

    const result = await resolveAtrClaimsFromHeadersAsync(
      { authorization: `Bearer ${token}` },
      loadGatewayAuthConfig()
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("user-1");
      expect(result.claims.tenantId).toBe("acme");
      expect(result.claims.acr).toBe("mfa");
      expect(result.claims.amr).toEqual(["pwd", "otp"]);
      expect(claimsHaveMfa(result.claims)).toBe(true);
    }
  });

  it("maps flat OIDC claims when atr object absent", () => {
    const claims = atrClaimsFromJwtPayload({
      sub: "alice",
      role: "admin",
      scope: "execute memory",
      tenant_id: "t1",
      acr: "1",
    });
    expect(claims.sub).toBe("alice");
    expect(claims.role).toBe("admin");
    expect(claims.scope).toContain("execute");
    expect(claims.tenantId).toBe("t1");
    expect(claimsHaveMfa(claims)).toBe(false);
  });

  it("rejects missing bearer in oidc mode", async () => {
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = "test-secret-at-least-32-chars!!";
    const r = await resolveOidcAtrClaimsFromHeaders({});
    expect(r.ok).toBe(false);
  });

  it("verifyOidcBearerToken fails on bad signature", async () => {
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = "test-secret-at-least-32-chars!!";
    const r = await verifyOidcBearerToken("not.a.jwt");
    expect(r.ok).toBe(false);
  });
});

describe("clawql-auth policy", () => {
  const prevRequire = process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL;

  afterEach(() => {
    if (prevRequire === undefined) delete process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL;
    else process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL = prevRequire;
  });

  it("gates financial tools when MFA required", () => {
    process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL = "1";
    expect(isMfaRequiredForFinancialTools()).toBe(true);
    expect(isFinancialTool("payments_credits_transfer_confirm")).toBe(true);
    expect(() =>
      assertToolPolicy(
        { sub: "u", role: "operator", scope: ["*"] },
        "payments_credits_transfer_confirm"
      )
    ).toThrow(/MFA/);
    expect(() =>
      assertToolPolicy(
        { sub: "u", role: "operator", scope: ["*"], acr: "mfa" },
        "payments_credits_transfer_confirm"
      )
    ).not.toThrow();
  });
});

describe("clawql-auth step-up", () => {
  it("TOTP round-trip", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("file store enroll + require", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-auth-stepup-"));
    try {
      const store = createFileStepUpStore(join(dir, "step-up.json"));
      const { enrollment, created } = await store.enroll({
        subjectId: "tenant-a",
        issuer: "ClawQL Test",
      });
      expect(created).toBe(true);
      const code = generateTotp(enrollment.secretBase32);
      await expect(store.require("tenant-a", code)).resolves.toBeUndefined();
      await expect(store.require("tenant-a", "000000")).rejects.toThrow(/Invalid/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("createClawQLAuth exposes step-up + policy", () => {
    const auth = createClawQLAuth({ mode: "noAuth" });
    expect(auth.mode).toBe("noAuth");
    const r = auth.resolveClaims({});
    expect(r.ok).toBe(true);
    expect(auth.stepUp.totp.generateSecret().length).toBeGreaterThan(10);
  });
});
