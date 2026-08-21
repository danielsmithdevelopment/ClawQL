import { describe, expect, it, vi } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import { ReauthRequiredError } from "./errors.js";
import {
  createMemoryOAuthPersistence,
  createOAuthTokenStore,
} from "./token-store.js";
import type { StoredOAuthToken } from "./types.js";

describe("OAuthTokenStore", () => {
  it("returns current token when not expiring soon", async () => {
    const persistence = createMemoryOAuthPersistence();
    const refresh = vi.fn();
    const store = createOAuthTokenStore({
      persistence,
      refresh,
      now: () => 1_000_000,
    });

    const token: StoredOAuthToken = {
      accessToken: "a",
      refreshToken: "r",
      expiresAtMs: 1_000_000 + 120_000,
    };
    await persistence.save("acme:google:user", token);

    const got = await store.getValidToken("acme:google:user");
    expect(got.accessToken).toBe("a");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes proactively within 60s window", async () => {
    const persistence = createMemoryOAuthPersistence();
    const events: AuthEvent[] = [];
    const store = createOAuthTokenStore({
      persistence,
      now: () => 1_000_000,
      eventSink: (e) => {
        events.push(e);
      },
      refresh: async (_key, current) => ({
        accessToken: "fresh",
        refreshToken: "r2",
        expiresAtMs: 1_000_000 + 3_600_000,
        scope: current.scope,
      }),
    });

    await persistence.save("acme:google:user", {
      accessToken: "stale",
      refreshToken: "r1",
      expiresAtMs: 1_000_000 + 30_000,
    });

    const got = await store.getValidToken("acme:google:user");
    expect(got.accessToken).toBe("fresh");
    expect(events.some((e) => e.type === "OAUTH_TOKEN_REFRESHED")).toBe(true);
  });

  it("mutex: concurrent refreshes call IdP once", async () => {
    const persistence = createMemoryOAuthPersistence();
    let refreshCalls = 0;
    let resolveRefresh!: (t: StoredOAuthToken) => void;
    const refreshGate = new Promise<StoredOAuthToken>((resolve) => {
      resolveRefresh = resolve;
    });

    const store = createOAuthTokenStore({
      persistence,
      now: () => 1_000_000,
      refresh: async () => {
        refreshCalls += 1;
        return refreshGate;
      },
    });

    await persistence.save("t:google:u", {
      accessToken: "old",
      refreshToken: "r",
      expiresAtMs: 1_000_000 + 10_000,
    });

    const waiters = Array.from({ length: 50 }, () => store.getValidToken("t:google:u"));

    // Allow microtasks to queue behind the lock
    await Promise.resolve();
    expect(refreshCalls).toBe(1);

    resolveRefresh({
      accessToken: "new",
      refreshToken: "r2",
      expiresAtMs: 1_000_000 + 3_600_000,
    });

    const results = await Promise.all(waiters);
    expect(refreshCalls).toBe(1);
    expect(results.every((r) => r.accessToken === "new")).toBe(true);
  });

  it("maps invalid_grant to ReauthRequiredError and emits events", async () => {
    const persistence = createMemoryOAuthPersistence();
    const events: AuthEvent[] = [];
    const store = createOAuthTokenStore({
      persistence,
      now: () => 1_000_000,
      eventSink: (e) => {
        events.push(e);
      },
      refresh: async () => {
        const err = new Error("revoked") as Error & { error: string };
        err.error = "invalid_grant";
        throw err;
      },
    });

    await persistence.save("t:microsoft:u", {
      accessToken: "old",
      refreshToken: "dead",
      expiresAtMs: 1_000_000 + 5_000,
    });

    await expect(store.getValidToken("t:microsoft:u")).rejects.toBeInstanceOf(
      ReauthRequiredError
    );
    expect(events.some((e) => e.type === "OAUTH_REFRESH_FAILED")).toBe(true);
    expect(events.some((e) => e.type === "OAUTH_REAUTH_REQUIRED")).toBe(true);
  });

  it("throws ReauthRequiredError when no token stored", async () => {
    const store = createOAuthTokenStore({
      persistence: createMemoryOAuthPersistence(),
      refresh: async () => {
        throw new Error("should not refresh");
      },
    });
    await expect(store.getValidToken("missing")).rejects.toMatchObject({
      _tag: "ReauthRequiredError",
      reason: "no_token",
    });
  });
});
