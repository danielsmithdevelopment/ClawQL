import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { ReauthRequiredError } from "./errors.js";
import {
  ReauthNotifyError,
  buildOAuthReauthUrlEffect,
  notifyReauthRequiredEffect,
  type ReauthNotifyPayload,
} from "./reauth-notify.js";

describe("reauth-notify", () => {
  it("builds a re-auth URL with provider + state only", async () => {
    const url = await Effect.runPromise(
      buildOAuthReauthUrlEffect("https://auth.clawql.test/oauth/authorize", {
        providerId: "google",
        state: "abc123",
      })
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://auth.clawql.test/oauth/authorize");
    expect(parsed.searchParams.get("provider")).toBe("google");
    expect(parsed.searchParams.get("state")).toBe("abc123");
    expect(parsed.searchParams.has("client_secret")).toBe(false);
  });

  it("notifies when ReauthRequiredError includes reauthUrl", async () => {
    const payloads: ReauthNotifyPayload[] = [];
    await Effect.runPromise(
      notifyReauthRequiredEffect(
        {
          notify: (p) =>
            Effect.sync(() => {
              payloads.push(p);
            }),
        },
        new ReauthRequiredError({
          tokenKey: "t:google:u",
          providerId: "google",
          reason: "invalid_grant",
          reauthUrl: "https://auth.clawql.test/oauth/authorize?provider=google&state=s1",
        }),
        { channel: "telegram", notifyTarget: "chat-9" }
      )
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.channel).toBe("telegram");
    expect(payloads[0]!.notifyTarget).toBe("chat-9");
    expect(payloads[0]!.reauthUrl).toContain("provider=google");
  });

  it("fails when reauthUrl is missing", async () => {
    const exit = await Effect.runPromiseExit(
      notifyReauthRequiredEffect(
        { notify: () => Effect.void },
        new ReauthRequiredError({
          tokenKey: "t:google:u",
          providerId: "google",
          reason: "no_token",
        }),
        { channel: "telegram" }
      )
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(ReauthNotifyError);
    }
  });
});
