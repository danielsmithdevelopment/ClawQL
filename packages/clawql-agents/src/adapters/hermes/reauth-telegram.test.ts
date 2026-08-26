import { ReauthNotifyError, type ReauthNotifyPayload } from "clawql-auth";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  createTelegramReauthNotifier,
  createTelegramReauthNotifierFromEnv,
} from "./reauth-telegram.js";

describe("createTelegramReauthNotifier", () => {
  const basePayload: ReauthNotifyPayload = {
    providerId: "google",
    tokenKey: "t:google:u",
    reason: "invalid_grant",
    reauthUrl: "https://auth.clawql.test/oauth/authorize?provider=google&state=s1",
    channel: "telegram",
  };

  it("POSTs sendMessage with URL + reason only (no secrets)", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const notifier = createTelegramReauthNotifier({
      botToken: "tok-test",
      defaultChatId: "42",
      apiBaseUrl: "https://telegram.test",
      fetchImpl,
    });

    await Effect.runPromise(notifier.notify(basePayload));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://telegram.test/bottok-test/sendMessage");
    const body = calls[0]!.body as { chat_id: string; text: string };
    expect(body.chat_id).toBe("42");
    expect(body.text).toContain("provider=google");
    expect(body.text).toContain("invalid_grant");
    expect(body.text).not.toMatch(/refresh|client_secret|Bearer/i);
  });

  it("prefers payload.notifyTarget over default chat id", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 200 })
    ) as unknown as typeof fetch;
    const notifier = createTelegramReauthNotifier({
      botToken: "tok",
      defaultChatId: "1",
      fetchImpl,
    });
    await Effect.runPromise(notifier.notify({ ...basePayload, notifyTarget: "99" }));
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body)).chat_id).toBe("99");
  });

  it("fails closed on non-2xx Telegram response", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("bad", { status: 401 })
    ) as unknown as typeof fetch;
    const notifier = createTelegramReauthNotifier({
      botToken: "tok",
      defaultChatId: "1",
      fetchImpl,
    });
    const exit = await Effect.runPromiseExit(notifier.notify(basePayload));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(ReauthNotifyError);
      expect((exit.cause.error as ReauthNotifyError).reason).toMatch(/telegram_http_401/);
    }
  });
});

describe("createTelegramReauthNotifierFromEnv", () => {
  it("returns null when env credentials are missing", () => {
    expect(createTelegramReauthNotifierFromEnv({})).toBeNull();
  });

  it("builds notifier when TELEGRAM_BOT_TOKEN + YOUR_TELEGRAM_USER_ID set", () => {
    const n = createTelegramReauthNotifierFromEnv({
      TELEGRAM_BOT_TOKEN: "t",
      YOUR_TELEGRAM_USER_ID: "7",
    });
    expect(n).not.toBeNull();
  });
});
