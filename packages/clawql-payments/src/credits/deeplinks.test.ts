import { afterEach, describe, expect, it } from "vitest";
import {
  buildClawqlPayUri,
  buildCreditsTransferApproveUrl,
  buildCreditsTransferCancelUrl,
  buildInviteDeepLink,
  buildPayDeepLink,
  buildPayQrPayload,
  buildRequestDeepLink,
  creditsHateoasBase,
  isHttpCreditsHateoasBase,
  parseCreditsDeepLink,
  payCliHint,
  payHateoasEnvelope,
} from "./deeplinks.js";

describe("credits deeplinks", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("falls back to compensation / clawql://tool base", () => {
    delete process.env.CLAWQL_CREDITS_HATEOAS_BASE;
    delete process.env.CLAWQL_COMPENSATION_APPROVAL_BASE;
    delete process.env.CLAWQL_OUROBOROS_GATEWAY_URL;
    expect(creditsHateoasBase()).toBe("clawql://tool");
    expect(isHttpCreditsHateoasBase()).toBe(false);
  });

  it("builds http pay + invite links when base is set", () => {
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "https://pay.example/";
    expect(isHttpCreditsHateoasBase()).toBe(true);
    expect(
      buildPayDeepLink({ to: "@bob", amountUsd: 10, note: "coffee" })
    ).toBe("https://pay.example/credits/pay?to=%40bob&amount=10&note=coffee");
    expect(buildRequestDeepLink({ requestId: "req-1" })).toBe(
      "https://pay.example/credits/request/req-1"
    );
    expect(buildInviteDeepLink({ requestId: "req-1", token: "tok" })).toMatch(
      /https:\/\/pay\.example\/credits\/request\/invite\?request_id=req-1&token=tok/
    );
  });

  it("builds clawql:// pay URI and QR payload", () => {
    const uri = buildClawqlPayUri({ to: "bob@acme.com", amountUsd: 5 });
    expect(uri).toBe("clawql://pay?to=bob%40acme.com&amount=5");
    expect(buildPayQrPayload({ to: "@bob", amountUsd: 1 })).toBe(
      "clawql://pay?to=%40bob&amount=1"
    );
  });

  it("parses clawql and http pay links", () => {
    const a = parseCreditsDeepLink("clawql://pay?to=@bob&amount=10&note=hi");
    expect(a).toMatchObject({ ok: true, to: "@bob", amountUsd: 10, note: "hi" });
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "https://pay.example";
    const b = parseCreditsDeepLink(
      buildPayDeepLink({ to: "alice@acme.com", amountUsd: 2.5 })
    );
    expect(b).toMatchObject({ ok: true, to: "alice@acme.com", amountUsd: 2.5 });
  });

  it("payCliHint and envelope include HATEOAS links", () => {
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "https://pay.example";
    const pay = { to: "@bob", amountUsd: 10 };
    expect(payCliHint(pay)).toContain("credits pay");
    expect(payCliHint(pay)).toContain("--to @bob");
    const env = payHateoasEnvelope(pay);
    expect(env.links.self).toContain("/credits/pay?");
    expect(env.links.clawql).toMatch(/^clawql:\/\/pay\?/);
    expect(env.approval_url).toBe(env.links.self);
  });

  it("builds transfer magic-link approve/cancel URLs", () => {
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "https://pay.example";
    expect(buildCreditsTransferApproveUrl("aid", "abc123")).toBe(
      "https://pay.example/credits/transfer/approve?action_id=aid&code=abc123"
    );
    expect(buildCreditsTransferCancelUrl("aid", "abc123")).toContain(
      "/credits/transfer/cancel?"
    );
  });
});
