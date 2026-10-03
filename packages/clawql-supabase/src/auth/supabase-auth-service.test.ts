import { SignJWT } from "jose";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SupabaseAuthService, SupabaseAuthServiceLive } from "./supabase-auth-service.js";

const secret = "test-supabase-jwt-secret-32chars!!";

async function mintToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.sub ?? "user-1"))
    .setIssuer("https://proj.supabase.co/auth/v1")
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

describe("SupabaseAuthService.verifyAccessToken", () => {
  it("verifies HS256 access tokens", async () => {
    const token = await mintToken({ sub: "user-42", email: "a@b.co", role: "authenticated" });
    const env = {
      CLAWQL_ENABLE_SUPABASE: "1",
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
      CLAWQL_SUPABASE_JWT_SECRET: secret,
    } as NodeJS.ProcessEnv;

    const claims = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* SupabaseAuthService;
        return yield* auth.verifyAccessToken(token, env);
      }).pipe(Effect.provide(SupabaseAuthServiceLive))
    );

    expect(claims.sub).toBe("user-42");
    expect(claims.email).toBe("a@b.co");
    expect(claims.role).toBe("authenticated");
  });

  it("rejects tampered tokens", async () => {
    const token = await mintToken({ sub: "user-42", email: "a@b.co" });
    const env = {
      CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
      CLAWQL_SUPABASE_JWT_SECRET: "wrong-secret-value-not-matching!!",
    } as NodeJS.ProcessEnv;

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* SupabaseAuthService;
          return yield* auth.verifyAccessToken(token, env);
        }).pipe(Effect.provide(SupabaseAuthServiceLive))
      )
    ).rejects.toThrow();
  });
});
