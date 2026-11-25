import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  initialsFromName,
  loadManagedAuthConfigEffect,
  MOCK_MANAGED_SESSION,
  resolveManagedSessionEffect,
} from "./session";

describe("managed session", () => {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "CLAWQL_SUPABASE_URL",
    "CLAWQL_SUPABASE_ANON_KEY",
    "CLAWQL_MANAGED_AUTH_MOCK",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("allows mock when Supabase is not configured outside production", () => {
    const cfg = Effect.runSync(loadManagedAuthConfigEffect({ NODE_ENV: "development" }));
    expect(cfg.allowMock).toBe(true);
  });

  it("fails closed in production when Supabase is not configured and mock is off", () => {
    const cfg = Effect.runSync(
      loadManagedAuthConfigEffect({ NODE_ENV: "production", CLAWQL_MANAGED_AUTH_MOCK: "0" }),
    );
    expect(cfg.allowMock).toBe(false);
  });

  it("refuses CLAWQL_MANAGED_AUTH_MOCK in cloud production (audit 8.01)", () => {
    const cfg = Effect.runSync(
      loadManagedAuthConfigEffect({ NODE_ENV: "production", CLAWQL_MANAGED_AUTH_MOCK: "1" }),
    );
    expect(cfg.allowMock).toBe(false);
  });

  it("allows desktop managed fixture mock even when NODE_ENV=production", () => {
    const cfg = Effect.runSync(
      loadManagedAuthConfigEffect({
        NODE_ENV: "production",
        CLAWQL_DESKTOP_MODE: "1",
        CLAWQL_DESKTOP_MANAGED_FIXTURE: "1",
        CLAWQL_MANAGED_AUTH_MOCK: "1",
      }),
    );
    expect(cfg.allowMock).toBe(true);
  });

  it("resolves Acme fixture session in mock mode", async () => {
    const session = await Effect.runPromise(
      resolveManagedSessionEffect({ env: { CLAWQL_MANAGED_AUTH_MOCK: "1" } }),
    );
    expect(session).toEqual(MOCK_MANAGED_SESSION);
    expect(session.displayName).toBe("Dana Reyes");
  });

  it("fails closed when Supabase is configured but no token and mock is off", async () => {
    const exit = await Effect.runPromiseExit(
      resolveManagedSessionEffect({
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
          CLAWQL_MANAGED_AUTH_MOCK: "0",
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("builds initials from a display name", () => {
    expect(initialsFromName("Dana Reyes")).toBe("DR");
    expect(initialsFromName("Ava")).toBe("AV");
  });
});
