import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachCreditsHateoasRoutes } from "./hateoas-http.js";
import {
  creditsHateoasHighImpactTool,
  isCreditsHateoasAuthRequired,
  isCreditsHateoasPublicPath,
} from "./hateoas-auth.js";
import { claimDirectory, resetDirectoryForTests } from "./directory.js";
import { appendCreditEntry } from "./ledger.js";
import { resetMoneyRequestsForTests } from "./requests.js";

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/credits", express.urlencoded({ extended: false }));
  attachCreditsHateoasRoutes(app);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    await run(base);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

describe("credits hateoas auth helpers", () => {
  it("classifies public vs gated paths", () => {
    expect(isCreditsHateoasPublicPath("GET", "/pay")).toBe(true);
    expect(isCreditsHateoasPublicPath("GET", "/qr.svg")).toBe(true);
    expect(isCreditsHateoasPublicPath("GET", "/request/invite")).toBe(true);
    expect(isCreditsHateoasPublicPath("POST", "/request/invite/claim")).toBe(true);
    expect(isCreditsHateoasPublicPath("GET", "/")).toBe(false);
    expect(isCreditsHateoasPublicPath("GET", "/transfer/approve")).toBe(false);
    expect(isCreditsHateoasPublicPath("POST", "/transfer/confirm")).toBe(false);
  });

  it("maps high-impact tools for MFA policy", () => {
    expect(creditsHateoasHighImpactTool("POST", "/transfer/confirm")).toBe(
      "payments_credits_transfer_confirm"
    );
    expect(creditsHateoasHighImpactTool("POST", "/pay/stage")).toBe(
      "payments_credits_transfer_stage"
    );
    expect(creditsHateoasHighImpactTool("POST", "/request/abc/accept")).toBe(
      "payments_credits_transfer_stage"
    );
    expect(creditsHateoasHighImpactTool("GET", "/transfer/approve")).toBeUndefined();
  });

  it("requires auth for apiKey/oidc by default", () => {
    expect(isCreditsHateoasAuthRequired({ CLAWQL_AUTH_MODE: "noAuth" })).toBe(false);
    expect(isCreditsHateoasAuthRequired({ CLAWQL_AUTH_MODE: "apiKey" })).toBe(true);
    expect(isCreditsHateoasAuthRequired({ CLAWQL_AUTH_MODE: "oidc" })).toBe(true);
    expect(
      isCreditsHateoasAuthRequired({
        CLAWQL_AUTH_MODE: "oidc",
        CLAWQL_CREDITS_HATEOAS_PUBLIC: "1",
      })
    ).toBe(false);
    expect(
      isCreditsHateoasAuthRequired({
        CLAWQL_AUTH_MODE: "noAuth",
        CLAWQL_CREDITS_HATEOAS_REQUIRE_AUTH: "1",
      })
    ).toBe(true);
  });
});

describe("credits hateoas oidc gate", () => {
  let home: string;
  const secret = "test-secret-at-least-32-chars!!";

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-credits-auth-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "http://127.0.0.1:9";
    process.env.CLAWQL_AUTH_MODE = "oidc";
    process.env.CLAWQL_AUTH_OIDC_HS256_SECRET = secret;
    process.env.CLAWQL_AUTH_OIDC_ISSUER = "https://idp.example";
    delete process.env.CLAWQL_CREDITS_HATEOAS_PUBLIC;
    delete process.env.CLAWQL_CREDITS_HATEOAS_REQUIRE_AUTH;
    delete process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL;
    delete process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP;
    await resetDirectoryForTests(process.env);
    await resetMoneyRequestsForTests(process.env);
  });

  afterEach(async () => {
    delete process.env.CLAWQL_AUTH_MODE;
    delete process.env.CLAWQL_AUTH_OIDC_HS256_SECRET;
    delete process.env.CLAWQL_AUTH_OIDC_ISSUER;
    delete process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL;
    delete process.env.CLAWQL_CREDITS_HATEOAS_BASE;
    await rm(home, { recursive: true, force: true });
  });

  async function bearer(claims: Record<string, unknown> = {}): Promise<string> {
    const key = new TextEncoder().encode(secret);
    return new SignJWT({
      sub: "alice",
      role: "operator",
      scope: ["execute"],
      tenant_id: "alice",
      ...claims,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://idp.example")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(key);
  }

  it("allows public pay landing without bearer; gates home and approve", async () => {
    await withApp(async (base) => {
      const pay = await fetch(`${base}/credits/pay?to=%40bob&amount=5`);
      expect(pay.status).toBe(200);

      const homeRes = await fetch(`${base}/credits`);
      expect(homeRes.status).toBe(401);
      expect(await homeRes.text()).toMatch(/Sign in|oidc|Bearer|Unauthorized|required/i);

      const token = await bearer();
      const homeOk = await fetch(`${base}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(homeOk.status).toBe(200);
      expect(await homeOk.text()).toContain("Total balance");

      const approve = await fetch(`${base}/credits/transfer/approve?action_id=missing&code=bad`);
      expect(approve.status).toBe(401);

      const approveAuthed = await fetch(
        `${base}/credits/transfer/approve?action_id=missing&code=bad`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Auth passed; bad action → 400 from handler
      expect(approveAuthed.status).toBe(400);
    });
  });

  it("requires MFA claims for pay/stage when financial MFA policy is on", async () => {
    process.env.CLAWQL_AUTH_REQUIRE_MFA_FOR_FINANCIAL = "1";
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice", handle: "alice" });
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob", handle: "bob" });
    await appendCreditEntry({
      tenantId: "alice",
      kind: "topup_settled",
      deltaCents: 5000,
      grantSource: "topup",
    });

    await withApp(async (base) => {
      const noMfa = await bearer();
      const denied = await fetch(`${base}/credits/pay/stage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${noMfa}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          from: "alice",
          to: "@bob",
          amount: "1",
        }).toString(),
      });
      expect(denied.status).toBe(403);

      const withMfa = await bearer({ amr: ["pwd", "otp"] });
      const ok = await fetch(`${base}/credits/pay/stage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${withMfa}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          from: "alice",
          to: "@bob",
          amount: "1",
        }).toString(),
      });
      expect(ok.status).toBe(200);
      expect(await ok.text()).toContain("Authorize with magic link");
    });
  });
});
