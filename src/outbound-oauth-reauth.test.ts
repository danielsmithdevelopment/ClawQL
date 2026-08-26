import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  createHostOutboundOAuthTokenStore,
  createTelegramOnReauthRequired,
} from "./outbound-oauth-reauth.js";
import { createMemoryOAuthPersistence, ReauthRequiredError } from "clawql-auth";

describe("createTelegramOnReauthRequired", () => {
  it("returns undefined without Telegram env", () => {
    expect(createTelegramOnReauthRequired({})).toBeUndefined();
  });

  it("returns undefined when CLAWQL_OUTBOUND_REAUTH_NOTIFY=0", () => {
    expect(
      createTelegramOnReauthRequired({
        TELEGRAM_BOT_TOKEN: "t",
        YOUR_TELEGRAM_USER_ID: "1",
        CLAWQL_OUTBOUND_REAUTH_NOTIFY: "0",
      })
    ).toBeUndefined();
  });
});

describe("createHostOutboundOAuthTokenStore", () => {
  it("attaches reauthUrl from CLAWQL_OAUTH_REAUTH_BASE_URL", async () => {
    const store = createHostOutboundOAuthTokenStore(
      {
        persistence: createMemoryOAuthPersistence(),
        refresh: () => Effect.die("no"),
      },
      {
        CLAWQL_OAUTH_REAUTH_BASE_URL: "https://auth.clawql.test/oauth/authorize",
        CLAWQL_OUTBOUND_REAUTH_NOTIFY: "0",
      }
    );
    const exit = await Effect.runPromiseExit(store.getValidToken("acme:google:u1"));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      const err = exit.cause.error as ReauthRequiredError;
      expect(err).toBeInstanceOf(ReauthRequiredError);
      expect(err.reauthUrl).toContain("provider=google");
      expect(err.reauthUrl).toContain("state=acme%3Agoogle%3Au1");
    }
  });
});
