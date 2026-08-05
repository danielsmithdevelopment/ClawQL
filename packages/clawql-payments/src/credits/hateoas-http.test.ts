import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachCreditsHateoasRoutes } from "./hateoas-http.js";
import { claimDirectory, resetDirectoryForTests } from "./directory.js";
import { appendCreditEntry } from "./ledger.js";
import { createMoneyRequest, resetMoneyRequestsForTests } from "./requests.js";

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

describe("credits hateoas http", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-credits-hateoas-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_CREDITS_P2P_ENABLED = "1";
    process.env.CLAWQL_CREDITS_HATEOAS_BASE = "http://127.0.0.1:9";
    delete process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP;
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    await resetDirectoryForTests(process.env);
    await resetMoneyRequestsForTests(process.env);
  });

  afterEach(async () => {
    delete process.env.CLAWQL_CREDITS_HATEOAS_BASE;
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    await rm(home, { recursive: true, force: true });
  });

  it("GET /credits mini home, compose screens, and pay landing", async () => {
    await withApp(async (base) => {
      const home = await fetch(`${base}/credits`);
      expect(home.status).toBe(200);
      const homeBody = await home.text();
      expect(homeBody).toContain("Claw");
      expect(homeBody).toContain("Fraunces");
      expect(homeBody).toContain("Total balance");
      expect(homeBody).toContain(">Top up<");
      expect(homeBody).toContain(">Pay<");
      expect(homeBody).toContain(">Request<");
      expect(homeBody).toContain(">Activity<");
      expect(homeBody).toContain('href="/credits/topup?tenant=default"');
      expect(homeBody).toContain('href="/credits/pay?tenant=default"');
      expect(homeBody).toContain('href="/credits/request/new?tenant=default"');
      expect(homeBody).toContain('href="/credits/activity?tenant=default"');
      expect(homeBody).not.toContain('action="/credits/pay"');

      const payCompose = await fetch(`${base}/credits/pay?tenant=default`);
      expect(payCompose.status).toBe(200);
      const payComposeBody = await payCompose.text();
      expect(payComposeBody).toContain("Pay");
      expect(payComposeBody).toContain('action="/credits/pay"');
      expect(payComposeBody).toContain('name="to"');

      const requestCompose = await fetch(`${base}/credits/request/new?tenant=default`);
      expect(requestCompose.status).toBe(200);
      expect(await requestCompose.text()).toContain("Request");

      const topup = await fetch(`${base}/credits/topup?tenant=default`);
      expect(topup.status).toBe(200);
      expect(await topup.text()).toContain("Top up");

      const activity = await fetch(`${base}/credits/activity?tenant=default`);
      expect(activity.status).toBe(200);
      const activityBody = await activity.text();
      expect(activityBody).toContain("Activity");
      expect(activityBody).toContain("$0.00");

      const html = await fetch(`${base}/credits/pay?to=%40bob&amount=10`, {
        headers: { Accept: "text/html" },
      });
      expect(html.status).toBe(200);
      const body = await html.text();
      expect(body).toContain("Claw");
      expect(body).toContain("@bob");
      expect(body).toContain("$10.00");
      expect(body).toContain("htmx.org");
      expect(body).toContain("Payment QR");
      expect(body).toContain('hx-post="/credits/pay/stage"');
      expect(body).toContain("Stage payment");

      const json = await fetch(`${base}/credits/pay?to=%40bob&amount=10`, {
        headers: { Accept: "application/json" },
      });
      expect(json.status).toBe(200);
      const envelope = (await json.json()) as { kind: string; links: { clawql: string } };
      expect(envelope.kind).toBe("credits.pay");
      expect(envelope.links.clawql).toContain("clawql://pay?");
    });
  });

  it("GET /credits/qr.svg returns SVG", async () => {
    await withApp(async (base) => {
      const res = await fetch(`${base}/credits/qr.svg?to=bob%40acme.com&amount=5`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/svg/);
      const svg = await res.text();
      expect(svg).toContain("<svg");
    });
  });

  it("invite page + claim via HTMX form post", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice" });
    const { request, inviteToken } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "newbie@acme.com",
      amountCents: 2500,
    });
    expect(inviteToken).toBeTruthy();

    await withApp(async (base) => {
      const page = await fetch(
        `${base}/credits/request/invite?request_id=${request.requestId}&token=${inviteToken}`
      );
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Claim invite");

      const claim = await fetch(`${base}/credits/request/invite/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: inviteToken!,
          requestId: request.requestId,
          tenantId: "newbie",
          handle: "newb",
        }).toString(),
      });
      expect(claim.status).toBe(200);
      const claimBody = await claim.text();
      expect(claimBody).toContain("Claimed");
      expect(claimBody).toContain("newbie");

      const reqPage = await fetch(`${base}/credits/request/${request.requestId}`, {
        headers: { Accept: "application/json" },
      });
      expect(reqPage.status).toBe(200);
      const data = (await reqPage.json()) as { data: { payerTenantId: string } };
      expect(data.data.payerTenantId).toBe("newbie");
    });
  });

  it("accept → magic-link authorize confirms transfer", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice" });
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob" });
    await appendCreditEntry({
      tenantId: "bob",
      kind: "topup_settled",
      deltaCents: 10_000,
      grantSource: "topup",
      note: "seed",
    });
    const { request } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "bob@acme.com",
      amountCents: 1200,
      note: "lunch",
    });

    await withApp(async (base) => {
      const accept = await fetch(`${base}/credits/request/${request.requestId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ payerTenantId: "bob" }).toString(),
      });
      expect(accept.status).toBe(200);
      const acceptBody = await accept.text();
      expect(acceptBody).toContain("Authorize with magic link");
      expect(acceptBody).toContain("/credits/transfer/approve?");
      const approveHref = acceptBody
        .match(/href="(\/credits\/transfer\/approve\?[^"]+)"/)?.[1]
        ?.replace(/&amp;/g, "&");
      expect(approveHref).toBeTruthy();

      const approve = await fetch(`${base}${approveHref}`);
      expect(approve.status).toBe(200);
      const approveBody = await approve.text();
      expect(approveBody).toContain("Authorize transfer");
      expect(approveBody).toContain("$12.00");
      expect(approveBody).toContain('action="/credits/transfer/confirm"');

      const actionId = approveBody.match(/name="action_id" value="([^"]+)"/)?.[1];
      const code = approveBody.match(/name="code" value="([^"]+)"/)?.[1];
      expect(actionId && code).toBeTruthy();

      const confirm = await fetch(`${base}/credits/transfer/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ action_id: actionId!, code: code! }).toString(),
      });
      expect(confirm.status).toBe(200);
      const confirmBody = await confirm.text();
      expect(confirmBody).toContain("Transfer authorized");
      expect(confirmBody).toContain("$12.00");
    });
  });

  it("pay/stage → magic link → cancel", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice", handle: "alice" });
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob", handle: "bob" });
    await appendCreditEntry({
      tenantId: "alice",
      kind: "topup_settled",
      deltaCents: 5000,
      grantSource: "topup",
    });

    await withApp(async (base) => {
      const stage = await fetch(`${base}/credits/pay/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          from: "alice",
          to: "@bob",
          amount: "7.5",
          note: "coffee",
        }).toString(),
      });
      expect(stage.status).toBe(200);
      const stageBody = await stage.text();
      expect(stageBody).toContain("Authorize with magic link");
      const approveHref = stageBody
        .match(/href="(\/credits\/transfer\/approve\?[^"]+)"/)?.[1]
        ?.replace(/&amp;/g, "&");
      expect(approveHref).toBeTruthy();
      const qs = new URL(approveHref!, "http://local").searchParams;
      const cancel = await fetch(
        `${base}/credits/transfer/cancel?action_id=${qs.get("action_id")}&code=${qs.get("code")}`
      );
      expect(cancel.status).toBe(200);
      expect(await cancel.text()).toContain("Cancelled");
    });
  });
});
