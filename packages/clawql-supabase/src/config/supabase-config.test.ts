import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  loadSupabaseConfigEffect,
  supabasePluginEnabled,
} from "./supabase-config.js";

describe("supabase config", () => {
  it("disabled by default", () => {
    expect(
      supabasePluginEnabled({
        CLAWQL_ENABLE_SUPABASE: undefined,
        CLAWQL_SUPABASE_URL: undefined,
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("enables with flag + url", async () => {
    const cfg = await Effect.runPromise(
      loadSupabaseConfigEffect({
        CLAWQL_ENABLE_SUPABASE: "1",
        CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
        CLAWQL_SUPABASE_JWT_SECRET: "secret",
      } as NodeJS.ProcessEnv)
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.issuer).toBe("https://proj.supabase.co/auth/v1");
    expect(cfg.jwksUrl).toContain("/auth/v1/.well-known/jwks.json");
    expect(
      supabasePluginEnabled({
        CLAWQL_ENABLE_SUPABASE: "1",
        CLAWQL_SUPABASE_URL: "https://proj.supabase.co",
      } as NodeJS.ProcessEnv)
    ).toBe(true);
  });
});
