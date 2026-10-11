import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  supabaseAuthServiceLayer,
  SupabaseAuthService,
  SupabaseAuthServiceLive,
} from "./supabase-auth-service.js";
import { assertRecentAuthenticationEffect } from "./session-recency.js";

const secret = "test-supabase-jwt-secret-32chars!!";
const issuer = "https://proj.supabase.co/auth/v1";
const audience = "authenticated";

async function mintHs256(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.sub ?? "user-1"))
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

function hs256Env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    CLAWQL_ENABLE_SUPABASE: "1",
    CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
    CLAWQL_SUPABASE_JWT_SECRET: secret,
    CLAWQL_SUPABASE_JWKS_URL: "",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("SupabaseAuthService.verifyAccessToken", () => {
  it("verifies HS256 access tokens when JWKS is disabled", async () => {
    const token = await mintHs256({ sub: "user-42", email: "a@b.co", role: "authenticated" });
    const claims = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* SupabaseAuthService;
        return yield* auth.verifyAccessToken(token, hs256Env());
      }).pipe(Effect.provide(SupabaseAuthServiceLive))
    );
    expect(claims.sub).toBe("user-42");
    expect(claims.email).toBe("a@b.co");
    expect(claims.role).toBe("authenticated");
  });

  it("rejects tampered tokens", async () => {
    const token = await mintHs256({ sub: "user-42", email: "a@b.co", role: "authenticated" });
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* SupabaseAuthService;
          return yield* auth.verifyAccessToken(
            token,
            hs256Env({ CLAWQL_SUPABASE_JWT_SECRET: "wrong-secret-value-not-matching!!" })
          );
        }).pipe(Effect.provide(SupabaseAuthServiceLive))
      )
    ).rejects.toThrow();
  });

  it("rejects anonymous-role tokens for privileged ops", async () => {
    const token = await mintHs256({ sub: "anon-1", email: "a@b.co", role: "anon" });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* SupabaseAuthService;
        return yield* auth.verifyAccessToken(token, hs256Env());
      }).pipe(Effect.provide(SupabaseAuthServiceLive), Effect.result)
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const reason =
        result.failure && typeof result.failure === "object" && "reason" in result.failure
          ? String((result.failure as { reason: string }).reason)
          : String(result.failure);
      expect(reason).toMatch(/anonymous-role/i);
    }
  });

  it("verifies RS256 via JWKS and checks issuer/audience/exp/role", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "kid-test";
    jwk.alg = "RS256";
    jwk.use = "sig";

    const server = createServer((req, res) => {
      if (req.url?.includes("jwks")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no listen address");
    const jwksUrl = `http://127.0.0.1:${addr.port}/auth/v1/.well-known/jwks.json`;

    try {
      const token = await new SignJWT({ email: "jwks@b.co", role: "authenticated" })
        .setProtectedHeader({ alg: "RS256", kid: "kid-test" })
        .setSubject("jwks-user")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      const env = {
        CLAWQL_ENABLE_SUPABASE: "1",
        CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
        CLAWQL_SUPABASE_JWKS_URL: jwksUrl,
        CLAWQL_SUPABASE_JWT_ISSUER: issuer,
        CLAWQL_SUPABASE_JWT_AUDIENCE: audience,
      } as NodeJS.ProcessEnv;

      const claims = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* SupabaseAuthService;
          return yield* auth.verifyAccessToken(token, env);
        }).pipe(Effect.provide(SupabaseAuthServiceLive))
      );
      expect(claims.sub).toBe("jwks-user");
      expect(claims.role).toBe("authenticated");
      expect(claims.iss).toBe(issuer);

      const expired = await new SignJWT({ email: "jwks@b.co", role: "authenticated" })
        .setProtectedHeader({ alg: "RS256", kid: "kid-test" })
        .setSubject("jwks-user")
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 120)
        .sign(privateKey);

      const expiredResult = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* SupabaseAuthService;
          return yield* auth.verifyAccessToken(expired, env);
        }).pipe(Effect.provide(SupabaseAuthServiceLive), Effect.result)
      );
      expect(expiredResult._tag).toBe("Failure");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it("caches JWKS and rate-limits unknown-kid refetches while cooling down", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "kid-cached";
    jwk.alg = "RS256";
    jwk.use = "sig";

    let fetches = 0;
    const server = createServer((req, res) => {
      if (req.url?.includes("jwks")) {
        fetches += 1;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no listen address");
    const jwksUrl = `http://127.0.0.1:${addr.port}/auth/v1/.well-known/jwks.json`;
    const env = {
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
      CLAWQL_SUPABASE_JWKS_URL: jwksUrl,
      CLAWQL_SUPABASE_JWT_ISSUER: issuer,
      CLAWQL_SUPABASE_JWT_AUDIENCE: audience,
    } as NodeJS.ProcessEnv;
    const layer = supabaseAuthServiceLayer({
      cooldownDuration: 60_000,
      cacheMaxAge: 600_000,
      timeoutDuration: 2500,
    });

    const mint = (kid: string) =>
      new SignJWT({ email: "jwks@b.co", role: "authenticated" })
        .setProtectedHeader({ alg: "RS256", kid })
        .setSubject("jwks-user")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

    try {
      const known = await mint("kid-cached");
      const attacker = await mint("kid-attacker");

      const outcomes = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* SupabaseAuthService;
          const first = yield* auth.verifyAccessToken(known, env).pipe(Effect.result);
          const afterFirst = fetches;
          const second = yield* auth.verifyAccessToken(known, env).pipe(Effect.result);
          const afterSecond = fetches;
          const limited = yield* auth.verifyAccessToken(attacker, env).pipe(Effect.result);
          return { first, second, limited, afterFirst, afterSecond, afterLimited: fetches };
        }).pipe(Effect.provide(layer))
      );

      expect(outcomes.first._tag).toBe("Success");
      expect(outcomes.afterFirst).toBe(1);
      expect(outcomes.second._tag).toBe("Success");
      expect(outcomes.afterSecond).toBe(1);
      expect(outcomes.limited._tag).toBe("Failure");
      expect(outcomes.afterLimited).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it("refetches JWKS on an unknown kid once cooldown has elapsed", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "kid-cached";
    jwk.alg = "RS256";
    jwk.use = "sig";

    let fetches = 0;
    const server = createServer((req, res) => {
      if (req.url?.includes("jwks")) {
        fetches += 1;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no listen address");
    const jwksUrl = `http://127.0.0.1:${addr.port}/auth/v1/.well-known/jwks.json`;
    const env = {
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
      CLAWQL_SUPABASE_JWKS_URL: jwksUrl,
      CLAWQL_SUPABASE_JWT_ISSUER: issuer,
      CLAWQL_SUPABASE_JWT_AUDIENCE: audience,
    } as NodeJS.ProcessEnv;
    const layer = supabaseAuthServiceLayer({
      cooldownDuration: 0,
      cacheMaxAge: 600_000,
      timeoutDuration: 2500,
    });

    try {
      const known = await new SignJWT({ email: "jwks@b.co", role: "authenticated" })
        .setProtectedHeader({ alg: "RS256", kid: "kid-cached" })
        .setSubject("jwks-user")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
      const rotated = await new SignJWT({ email: "jwks@b.co", role: "authenticated" })
        .setProtectedHeader({ alg: "RS256", kid: "kid-rotated-unknown" })
        .setSubject("jwks-user")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);

      const outcomes = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* SupabaseAuthService;
          const first = yield* auth.verifyAccessToken(known, env).pipe(Effect.result);
          const afterFirst = fetches;
          const miss = yield* auth.verifyAccessToken(rotated, env).pipe(Effect.result);
          return { first, miss, afterFirst, afterMiss: fetches };
        }).pipe(Effect.provide(layer))
      );

      expect(outcomes.first._tag).toBe("Success");
      expect(outcomes.afterFirst).toBe(1);
      expect(outcomes.miss._tag).toBe("Failure");
      expect(outcomes.afterMiss).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});

describe("assertRecentAuthenticationEffect", () => {
  it("accepts a freshly issued token and rejects a hours-old iat", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fresh = await mintHs256({ sub: "user-42", email: "a@b.co", role: "authenticated" });
    const freshClaims = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* SupabaseAuthService;
        return yield* auth.verifyAccessToken(fresh, hs256Env());
      }).pipe(Effect.provide(SupabaseAuthServiceLive))
    );
    await Effect.runPromise(assertRecentAuthenticationEffect(freshClaims, { nowSeconds: now }));

    const staleToken = await new SignJWT({ email: "a@b.co", role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-42")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(secret));
    const staleClaims = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* SupabaseAuthService;
        return yield* auth.verifyAccessToken(staleToken, hs256Env());
      }).pipe(Effect.provide(SupabaseAuthServiceLive))
    );
    const stale = await Effect.runPromise(
      assertRecentAuthenticationEffect(staleClaims, { nowSeconds: now }).pipe(Effect.result)
    );
    expect(stale._tag).toBe("Failure");
    if (stale._tag === "Failure") {
      expect(String((stale.failure as { reason: string }).reason)).toMatch(
        /reauthentication required/i
      );
    }
  });

  it("prefers a recent amr timestamp over an old iat", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      email: "a@b.co",
      role: "authenticated",
      amr: [{ method: "password", timestamp: now - 30 }],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-42")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(secret));
    const claims = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* SupabaseAuthService;
        return yield* auth.verifyAccessToken(token, hs256Env());
      }).pipe(Effect.provide(SupabaseAuthServiceLive))
    );
    await Effect.runPromise(assertRecentAuthenticationEffect(claims, { nowSeconds: now }));
  });
});
