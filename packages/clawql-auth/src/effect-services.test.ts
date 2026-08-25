import { Effect, Exit } from "effect";
import { SignJWT } from "jose";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AwsSigV4Service, AwsSigV4ServiceLive } from "./aws-sigv4.js";
import {
  AwsAuthError,
  AwsAuthHelpers,
  AwsAuthHelpersLive,
  resolveAwsApiBaseUrlEffect,
  resolveAwsRegionEffect,
} from "./aws-auth.js";
import type { OpenAPIDoc } from "./openapi-types.js";
import { createGatewayAuthServiceLayer, GatewayAuthService } from "./gateway-service.js";
import { loadGatewayAuthConfig, resolveAtrClaimsFromHeadersEffect } from "./gateway.js";
import { createOidcAuthServiceLayer, OidcAuthService } from "./oidc-service.js";
import { resetOidcVerifyCaches } from "./oidc.js";
import {
  AuthPolicyService,
  assertToolPolicyEffect,
  createAuthPolicyServiceLayer,
} from "./policy.js";
import {
  mergedAuthHeadersEffect,
  ProviderAuthHeadersService,
  ProviderAuthHeadersServiceLive,
} from "./provider-auth-headers.js";
import {
  createStepUpStoreLayer,
  createUnimplementedWebAuthnVerifier,
  generateTotpEffect,
  generateTotpSecretEffect,
  requireWebAuthnStepUpEffect,
  StepUpStoreService,
  TotpError,
  verifyTotpEffect,
  type WebAuthnStepUpVerifier,
} from "./step-up/index.js";

const emptyDoc = { openapi: "3.0.0", paths: {} } as OpenAPIDoc;

describe("clawql-auth Effect services", () => {
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

  it("OidcAuthService verifies an HS256 JWT via a provided layer", async () => {
    const secret = "test-secret-at-least-32-chars!!";
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
      atr: { sub: "user-9", role: "operator", scope: ["execute"], tenantId: "acme" },
      acr: "mfa",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);

    const program = Effect.gen(function* () {
      const svc = yield* OidcAuthService;
      return yield* svc.verifyBearerToken(token);
    });

    const claims = await Effect.runPromise(
      program.pipe(Effect.provide(createOidcAuthServiceLayer({ hs256Secret: secret })))
    );
    expect(claims.sub).toBe("user-9");
    expect(claims.tenantId).toBe("acme");
    expect(claims.acr).toBe("mfa");
  });

  it("OidcAuthService.resolveClaimsFromHeaders yields undefined when no bearer", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* OidcAuthService;
      return yield* svc.resolveClaimsFromHeaders({});
    });
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          createOidcAuthServiceLayer({ hs256Secret: "test-secret-32-characters-long!!" })
        )
      )
    );
    expect(result).toBeUndefined();
  });

  it("OidcAuthService fails on a bad signature (typed OidcAuthError)", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* OidcAuthService;
      return yield* svc.verifyBearerToken("not.a.jwt");
    });
    const exit = await Effect.runPromiseExit(
      program.pipe(Effect.provide(createOidcAuthServiceLayer({ hs256Secret: "s".repeat(32) })))
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("GatewayAuthService resolves admin claims in noAuth mode", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* GatewayAuthService;
      return yield* svc.resolveClaims({ "x-clawql-subject": "u42" });
    });
    const claims = await Effect.runPromise(
      program.pipe(Effect.provide(createGatewayAuthServiceLayer({ mode: "noAuth" })))
    );
    expect(claims.role).toBe("admin");
    expect(claims.sub).toBe("u42");
  });

  it("resolveAtrClaimsFromHeadersEffect verifies oidc JWT end to end", async () => {
    stash("CLAWQL_AUTH_MODE");
    stash("CLAWQL_AUTH_OIDC_HS256_SECRET");
    const secret = "test-secret-at-least-32-chars!!";
    process.env.CLAWQL_AUTH_MODE = "oidc";
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = secret;
    const token = await new SignJWT({ atr: { sub: "u", role: "operator", scope: ["search"] } })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(secret));

    const claims = await Effect.runPromise(
      resolveAtrClaimsFromHeadersEffect(
        { authorization: `Bearer ${token}` },
        Effect.runSync(loadGatewayAuthConfig())
      )
    );
    expect(claims.sub).toBe("u");
    expect(claims.scope).toContain("search");
  });

  it("StepUpStoreService enroll + require round-trip via layer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-auth-effect-stepup-"));
    try {
      const layer = createStepUpStoreLayer(join(dir, "step-up.json"));
      const program = Effect.gen(function* () {
        const store = yield* StepUpStoreService;
        const { enrollment, created } = yield* store.enroll({ subjectId: "tenant-x" });
        const code = yield* generateTotpEffect(enrollment.secretBase32);
        yield* store.require("tenant-x", code);
        return { created };
      });
      const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
      expect(result.created).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("StepUpStoreService.require fails with StepUpStoreError on invalid code", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-auth-effect-stepup-"));
    try {
      const layer = createStepUpStoreLayer(join(dir, "step-up.json"));
      const program = Effect.gen(function* () {
        const store = yield* StepUpStoreService;
        yield* store.enroll({ subjectId: "tenant-y" });
        return yield* store.require("tenant-y", "000000");
      });
      const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(layer)));
      expect(Exit.isFailure(exit)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AwsSigV4Service returns undefined without credentials / non-AWS labels", async () => {
    stash("AWS_ACCESS_KEY_ID");
    stash("AWS_SECRET_ACCESS_KEY");
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    const program = Effect.gen(function* () {
      const svc = yield* AwsSigV4Service;
      return yield* svc.maybeSign(
        new URL("https://sts.us-east-1.amazonaws.com/"),
        "/",
        { method: "POST", headers: {} },
        emptyDoc,
        "aws"
      );
    });
    const signed = await Effect.runPromise(program.pipe(Effect.provide(AwsSigV4ServiceLive)));
    expect(signed).toBeUndefined();
  });

  it("TOTP Effect API: generate + verify round-trip", async () => {
    const secret = await Effect.runPromise(generateTotpSecretEffect());
    const code = await Effect.runPromise(generateTotpEffect(secret));
    const ok = await Effect.runPromise(verifyTotpEffect(secret, code));
    expect(ok).toBe(true);
    const bad = await Effect.runPromise(verifyTotpEffect(secret, "000000"));
    expect(bad).toBe(false);
    expect(new TotpError({ reason: "x" })._tag).toBe("TotpError");
  });

  it("assertToolPolicyEffect fails with AuthPolicyError for financial tool without MFA", async () => {
    stash("CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL");
    process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL = "1";
    const exit = await Effect.runPromiseExit(
      assertToolPolicyEffect(
        { sub: "u", role: "operator", scope: ["*"] },
        "payments_credits_transfer_confirm"
      )
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const okExit = await Effect.runPromiseExit(
      assertToolPolicyEffect(
        { sub: "u", role: "operator", scope: ["*"], acr: "mfa" },
        "payments_credits_transfer_confirm"
      )
    );
    expect(Exit.isSuccess(okExit)).toBe(true);
  });

  it("AuthPolicyService gates financial tools via layer", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* AuthPolicyService;
      return yield* svc.assertToolAccess(
        { sub: "u", role: "operator", scope: ["*"] },
        "payments_credits_transfer_confirm"
      );
    });
    const exit = await Effect.runPromiseExit(
      program.pipe(
        Effect.provide(
          createAuthPolicyServiceLayer({
            ...process.env,
            CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL: "1",
          })
        )
      )
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("AwsAuthHelpers service resolves region and errors on empty servers", async () => {
    const region = await Effect.runPromise(
      Effect.gen(function* () {
        const helpers = yield* AwsAuthHelpers;
        return yield* helpers.resolveRegion();
      }).pipe(Effect.provide(AwsAuthHelpersLive))
    );
    expect(typeof region).toBe("string");

    const exit = await Effect.runPromiseExit(
      resolveAwsApiBaseUrlEffect({ openapi: "3.0.0", paths: {} } as OpenAPIDoc)
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(new AwsAuthError({ reason: "x" })._tag).toBe("AwsAuthError");
    await Effect.runPromise(resolveAwsRegionEffect());
  });

  it("ProviderAuthHeadersService.mergedAuthHeaders yields a headers object", async () => {
    const headers = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* ProviderAuthHeadersService;
        return yield* svc.mergedAuthHeaders("github");
      }).pipe(Effect.provide(ProviderAuthHeadersServiceLive))
    );
    expect(typeof headers).toBe("object");
    const direct = await Effect.runPromise(mergedAuthHeadersEffect());
    expect(typeof direct).toBe("object");
  });

  it("requireWebAuthnStepUpEffect fails with WebAuthnStepUpError for unimplemented verifier", async () => {
    const verifier = createUnimplementedWebAuthnVerifier();
    const exit = await Effect.runPromiseExit(
      requireWebAuthnStepUpEffect(verifier, { assertion: {}, expectedChallenge: "c" })
    );
    expect(Exit.isFailure(exit)).toBe(true);

    const okVerifier: WebAuthnStepUpVerifier = {
      verifyAssertion: async () => ({ ok: true as const }),
    };
    await Effect.runPromise(
      requireWebAuthnStepUpEffect(okVerifier, { assertion: {}, expectedChallenge: "c" })
    );
  });
});
