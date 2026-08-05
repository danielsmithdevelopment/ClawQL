import { describe, expect, it, vi } from "vitest";
import {
  buildMoneyRequestInviteEmail,
  creditsInviteEmailProvider,
  isCreditsInviteEmailDryRun,
  isCreditsInviteEmailEnabled,
  sendMoneyRequestInviteEmail,
  shouldSendInviteEmailOnCreate,
} from "./invite-email.js";

describe("credits invite email", () => {
  it("defaults to dry-run provider", () => {
    const env = {};
    expect(isCreditsInviteEmailEnabled(env)).toBe(false);
    expect(isCreditsInviteEmailDryRun(env)).toBe(true);
    expect(creditsInviteEmailProvider(env)).toBe("dry-run");
  });

  it("builds invite payload with link and CLI hint", () => {
    const payload = buildMoneyRequestInviteEmail(
      {
        toEmail: "Newbie@Acme.com",
        inviteUrl: "https://pay.example/credits/request/invite?request_id=r1&token=tok",
        requestId: "r1",
        amountCents: 2500,
        note: "dinner",
        fromLabel: "@alice",
        inviteToken: "tok",
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
      { CLAWQL_CREDITS_INVITE_EMAIL_FROM: "ClawQL <pay@example.com>" }
    );
    expect(payload.to).toBe("newbie@acme.com");
    expect(payload.from).toContain("pay@example.com");
    expect(payload.subject).toMatch(/\$25\.00/);
    expect(payload.text).toContain("https://pay.example/credits/request/invite");
    expect(payload.text).toContain("claim-invite --request-id r1 --token tok");
    expect(payload.html).toContain("Open invite");
    expect(payload.meta.dryRun).toBe(true);
  });

  it("dry-runs by default even when invite email enabled", async () => {
    const result = await sendMoneyRequestInviteEmail(
      {
        toEmail: "n@x.com",
        inviteUrl: "https://x/invite",
        requestId: "r",
        amountCents: 100,
      },
      { CLAWQL_CREDITS_INVITE_EMAIL: "1" }
    );
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.provider).toBe("dry-run");
    expect(result.previewText).toContain("https://x/invite");
  });

  it("posts to webhook provider when live", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "wh-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    const result = await sendMoneyRequestInviteEmail(
      {
        toEmail: "n@x.com",
        inviteUrl: "https://x/invite",
        requestId: "r",
        amountCents: 500,
        fromLabel: "Alice",
      },
      {
        CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN: "0",
        CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER: "webhook",
        CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL: "https://hooks.example/invite",
        CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_TOKEN: "secret",
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.provider).toBe("webhook");
    expect(result.messageId).toBe("wh-1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://hooks.example/invite");
    expect(call[1].headers).toMatchObject({
      authorization: "Bearer secret",
    });
    const body = JSON.parse(String(call[1].body));
    expect(body.type).toBe("credits.money_request.invite");
    expect(body.to).toBe("n@x.com");
    expect(body.subject).toMatch(/Alice/);
  });

  it("posts to Resend when configured", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 })
    );
    const result = await sendMoneyRequestInviteEmail(
      {
        toEmail: "n@x.com",
        inviteUrl: "https://x/invite",
        requestId: "r",
        amountCents: 1000,
      },
      {
        CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN: "0",
        CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER: "resend",
        CLAWQL_CREDITS_INVITE_EMAIL_RESEND_API_KEY: "re_test",
        CLAWQL_CREDITS_INVITE_EMAIL_FROM: "ClawQL <pay@example.com>",
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("re_123");
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.resend.com/emails");
    expect(call[1].headers).toMatchObject({
      authorization: "Bearer re_test",
    });
  });

  it("returns error on webhook failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const result = await sendMoneyRequestInviteEmail(
      {
        toEmail: "n@x.com",
        inviteUrl: "https://x/invite",
        requestId: "r",
        amountCents: 100,
      },
      {
        CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN: "0",
        CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER: "webhook",
        CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL: "https://hooks.example/invite",
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HTTP 500/);
  });

  it("shouldSendInviteEmailOnCreate respects flag and explicit override", () => {
    expect(shouldSendInviteEmailOnCreate({}, {})).toBe(false);
    expect(shouldSendInviteEmailOnCreate({}, { CLAWQL_CREDITS_INVITE_EMAIL: "1" })).toBe(true);
    expect(shouldSendInviteEmailOnCreate({ sendEmail: true }, {})).toBe(true);
    expect(
      shouldSendInviteEmailOnCreate({ sendEmail: false }, { CLAWQL_CREDITS_INVITE_EMAIL: "1" })
    ).toBe(false);
  });
});
