import { Effect, Exit } from "effect";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  atrClaimsFromJwtPayload,
  resetOidcVerifyCaches,
  resolveOidcAtrClaimsFromHeadersEffect,
  verifyOidcBearerTokenEffect,
} from "./oidc.js";
import {
  assertToolPolicyEffect,
  claimsHaveMfa,
  isFinancialTool,
  isMfaRequiredForFinancialTools,
} from "./policy.js";
import { createClawQLAuth } from "./create-auth.js";
import {
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeaders,
  resolveAtrClaimsFromHeadersEffect,
  resolveAuthMode,
  type AtrClaims,
} from "./gateway.js";
import {
  generateTotpEffect,
  generateTotpSecretEffect,
  stepUpStoreServiceFromPath,
  verifyTotpEffect,
} from "./step-up/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Run the gateway Effect at the test edge, mapping to the discriminated-union shape. */
function resolveClaimsUnion(headers: Record<string, string | string[] | undefined>) {
  return Effect.runPromise(
    resolveAtrClaimsFromHeadersEffect(headers, loadGatewayAuthConfig()).pipe(
      Effect.map((claims) => ({ ok: true as const, claims })),
      Effect.catchAll((err) => Effect.succeed({ ok: false as const, error: err.reason }))
    )
  );
}

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

    const result = await resolveClaimsUnion({ authorization: `Bearer ${token}` });
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
    const exit = await Effect.runPromiseExit(resolveOidcAtrClaimsFromHeadersEffect({}));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("verifyOidcBearerTokenEffect fails on bad signature", async () => {
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = "test-secret-at-least-32-chars!!";
    const exit = await Effect.runPromiseExit(verifyOidcBearerTokenEffect("not.a.jwt"));
    expect(Exit.isFailure(exit)).toBe(true);
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

    const noMfa: AtrClaims = { sub: "u", role: "operator", scope: ["*"] };
    const gated = Effect.runSyncExit(
      assertToolPolicyEffect(noMfa, "payments_credits_transfer_confirm")
    );
    expect(Exit.isFailure(gated)).toBe(true);

    const withMfa: AtrClaims = { sub: "u", role: "operator", scope: ["*"], acr: "mfa" };
    const allowed = Effect.runSyncExit(
      assertToolPolicyEffect(withMfa, "payments_credits_transfer_confirm")
    );
    expect(Exit.isSuccess(allowed)).toBe(true);
  });
});

describe("clawql-auth step-up", () => {
  it("TOTP round-trip", () => {
    const secret = Effect.runSync(generateTotpSecretEffect());
    const code = Effect.runSync(generateTotpEffect(secret));
    expect(Effect.runSync(verifyTotpEffect(secret, code))).toBe(true);
    expect(Effect.runSync(verifyTotpEffect(secret, "000000"))).toBe(false);
  });

  it("file store enroll + require", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-auth-stepup-"));
    try {
      const store = stepUpStoreServiceFromPath(join(dir, "step-up.json"));
      const { enrollment, created } = await Effect.runPromise(
        store.enroll({ subjectId: "tenant-a", issuer: "ClawQL Test" })
      );
      expect(created).toBe(true);
      const code = Effect.runSync(generateTotpEffect(enrollment.secretBase32));
      await Effect.runPromise(store.require("tenant-a", code));
      const bad = await Effect.runPromiseExit(store.require("tenant-a", "000000"));
      expect(Exit.isFailure(bad)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("createClawQLAuth exposes step-up + policy", () => {
    const auth = createClawQLAuth({ mode: "noAuth" });
    expect(auth.mode).toBe("noAuth");
    const r = auth.resolveClaims({});
    expect(r.ok).toBe(true);
    expect(Effect.runSync(auth.stepUp.totp.generateSecret()).length).toBeGreaterThan(10);
  });
});
