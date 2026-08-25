import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import { ReauthRequiredError } from "./errors.js";
import { createMemoryOAuthPersistence, createOAuthTokenStore } from "./token-store.js";
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
    await Effect.runPromise(persistence.save("acme:google:user", token));

    const got = await Effect.runPromise(store.getValidToken("acme:google:user"));
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
      refresh: (_key, current) =>
        Effect.succeed({
          accessToken: "fresh",
          refreshToken: "r2",
          expiresAtMs: 1_000_000 + 3_600_000,
          scope: current.scope,
        }),
    });

    await Effect.runPromise(
      persistence.save("acme:google:user", {
        accessToken: "stale",
        refreshToken: "r1",
        expiresAtMs: 1_000_000 + 30_000,
      })
    );

    const got = await Effect.runPromise(store.getValidToken("acme:google:user"));
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
      refresh: () =>
        Effect.sync(() => {
          refreshCalls += 1;
        }).pipe(Effect.flatMap(() => Effect.promise(() => refreshGate))),
    });

    await Effect.runPromise(
      persistence.save("t:google:u", {
        accessToken: "old",
        refreshToken: "r",
        expiresAtMs: 1_000_000 + 10_000,
      })
    );

    const waiters = Array.from({ length: 50 }, () =>
      Effect.runPromise(store.getValidToken("t:google:u"))
    );

    // Allow queued fibers to reach the shared in-flight refresh before asserting dedup.
    await new Promise((resolve) => setTimeout(resolve, 10));
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
      refresh: () =>
        Effect.fail(
          Object.assign(new Error("revoked"), { error: "invalid_grant" }) as Error & {
            error: string;
          }
        ),
    });

    await Effect.runPromise(
      persistence.save("t:microsoft:u", {
        accessToken: "old",
        refreshToken: "dead",
        expiresAtMs: 1_000_000 + 5_000,
      })
    );

    const exit = await Effect.runPromiseExit(store.getValidToken("t:microsoft:u"));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(ReauthRequiredError);
      expect((exit.cause.error as ReauthRequiredError).reason).toBe("invalid_grant");
    }
    expect(events.some((e) => e.type === "OAUTH_REFRESH_FAILED")).toBe(true);
    expect(events.some((e) => e.type === "OAUTH_REAUTH_REQUIRED")).toBe(true);
  });

  it("fails with ReauthRequiredError when no token stored", async () => {
    const store = createOAuthTokenStore({
      persistence: createMemoryOAuthPersistence(),
      refresh: () => Effect.die("should not refresh"),
    });
    const exit = await Effect.runPromiseExit(store.getValidToken("missing"));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(ReauthRequiredError);
      expect((exit.cause.error as ReauthRequiredError).reason).toBe("no_token");
    }
  });
});
